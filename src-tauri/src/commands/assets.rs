use std::path::Path;

use image::GenericImageView;
use resvg::{tiny_skia, usvg};
use tauri::State;

use crate::db::entity_asset_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity_asset::EntityAsset;
use crate::state::AppState;

const MAX_DIM: u32 = 200;
const MAX_INPUT_BYTES: u64 = 20 * 1024 * 1024; // 20 MB — prevent OOM loading huge raws
const MAX_OUTPUT_BYTES: usize = 20 * 1024; // 20 KB — per-image budget in the project folder
const JPEG_QUALITIES: &[u8] = &[85, 70, 55, 40, 25, 15, 5]; // try in order until output fits

// These are reference thumbnails for the writer's own use, not artwork storage.
// Every accepted format is rasterized and re-encoded as JPEG — PNG has no
// quality knob, so a busy PNG can't reliably be pushed under MAX_OUTPUT_BYTES
// the way a JPEG can via the quality ladder below. Transparency (if any) is
// composited onto white before encoding, since JPEG has no alpha channel.
fn output_ext(_ext: &str) -> &str {
    "jpg"
}

/// JPEG has no alpha channel — flatten any transparency onto a white background
/// before encoding. Without this, `image`'s JPEG encoder would silently drop the
/// alpha channel via `to_rgb8()`, leaving whatever raw RGB values sat underneath
/// (often black) instead of the intended white/blank background.
fn flatten_to_white(img: image::DynamicImage) -> image::DynamicImage {
    if !img.color().has_alpha() {
        return img;
    }
    let rgba = img.to_rgba8();
    let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
    for (dst, src) in rgb.pixels_mut().zip(rgba.pixels()) {
        let [r, g, b, a] = src.0;
        let alpha = a as f32 / 255.0;
        let blend = |c: u8| (c as f32 * alpha + 255.0 * (1.0 - alpha)).round() as u8;
        *dst = image::Rgb([blend(r), blend(g), blend(b)]);
    }
    image::DynamicImage::ImageRgb8(rgb)
}

fn rasterize_svg(data: &[u8]) -> Result<image::DynamicImage> {
    let tree = usvg::Tree::from_data(data, &usvg::Options::default())
        .map_err(|e| InkwellError::Validation(format!("Invalid SVG: {e}")))?;

    let size = tree.size();
    let (w, h) = (size.width(), size.height());
    if w <= 0.0 || h <= 0.0 {
        return Err(InkwellError::Validation("SVG has zero size".into()));
    }

    // Rasterize directly at (at most) the target resolution instead of the SVG's
    // native size, so a huge viewBox doesn't blow up memory before we resize.
    let scale = (MAX_DIM as f32 / w.max(h)).min(1.0);
    let px_w = ((w * scale).round() as u32).max(1);
    let px_h = ((h * scale).round() as u32).max(1);

    let mut pixmap = tiny_skia::Pixmap::new(px_w, px_h)
        .ok_or_else(|| InkwellError::Validation("Invalid SVG dimensions".into()))?;
    let transform = tiny_skia::Transform::from_scale(px_w as f32 / w, px_h as f32 / h);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let png_bytes = pixmap
        .encode_png()
        .map_err(|e| InkwellError::Validation(format!("Failed to rasterize SVG: {e}")))?;
    image::load_from_memory(&png_bytes)
        .map_err(|e| InkwellError::Validation(format!("Failed to rasterize SVG: {e}")))
}

fn encode_jpeg_under_limit(img: &image::DynamicImage, max_bytes: usize) -> Result<Vec<u8>> {
    for &quality in JPEG_QUALITIES {
        let mut buf = Vec::new();
        {
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                std::io::Cursor::new(&mut buf),
                quality,
            );
            img.write_with_encoder(encoder)
                .map_err(|e| InkwellError::Validation(e.to_string()))?;
        }
        if buf.len() <= max_bytes {
            return Ok(buf);
        }
    }
    Err(InkwellError::Validation(format!(
        "Image could not be reduced to under {}KB even at minimum quality. Try a smaller image.",
        max_bytes / 1024
    )))
}

fn resize_and_copy(src: &Path, dest: &Path, ext: &str) -> Result<()> {
    let input_size = src.metadata().map_err(InkwellError::Filesystem)?.len();
    if input_size > MAX_INPUT_BYTES {
        return Err(InkwellError::Validation(format!(
            "Image file is too large ({}MB). Maximum allowed is {}MB.",
            input_size / 1_048_576,
            MAX_INPUT_BYTES / 1_048_576
        )));
    }

    let img = if ext == "svg" {
        let data = std::fs::read(src)?;
        rasterize_svg(&data)?
    } else {
        // GIF is decoded to its first frame here too — animation isn't kept,
        // since these are static reference thumbnails.
        //
        // image::open()'s default Limits cap decode-time allocation at 512MiB,
        // which a genuinely large photo (e.g. 48MP+) can exceed even though the
        // compressed file is well under MAX_INPUT_BYTES. We already bound the
        // input file size above, so raise the decode-side limit rather than
        // fail on legitimate large photos.
        let mut reader = image::ImageReader::open(src)
            .map_err(|e| InkwellError::Validation(format!("Could not read image: {e}")))?;
        let mut limits = image::Limits::no_limits();
        limits.max_alloc = Some(2 * 1024 * 1024 * 1024);
        reader.limits(limits);
        reader
            .decode()
            .map_err(|e| InkwellError::Validation(format!("Could not read image: {e}")))?
    };

    let (w, h) = img.dimensions();
    let img = if w > MAX_DIM || h > MAX_DIM {
        // A single Lanczos3 pass widens its filter kernel proportionally to the
        // downsampling ratio to avoid aliasing, so resizing a high-megapixel photo
        // (e.g. 8000x6000) straight down to 200px can take tens of seconds to
        // minutes — easily long enough to look like the app just isn't responding.
        // Prefilter with the crate's fast box-style `thumbnail` (cheap, one input
        // pixel maps to one output pixel) down to a moderate size first, then do
        // the final high-quality Lanczos3 pass at a small, cheap ratio.
        let img = if w > MAX_DIM * 4 || h > MAX_DIM * 4 {
            img.thumbnail(MAX_DIM * 4, MAX_DIM * 4)
        } else {
            img
        };
        img.resize(MAX_DIM, MAX_DIM, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let img = flatten_to_white(img);
    let bytes = encode_jpeg_under_limit(&img, MAX_OUTPUT_BYTES)?;

    std::fs::write(dest, bytes)?;
    Ok(())
}

/// Guards against a crafted/traversal path writing outside the project folder.
/// Creates `dest`'s parent directory (needed before canonicalizing it, since
/// `canonicalize` requires the path to exist) then verifies the canonical parent
/// is still inside the canonical project root.
///
/// Uses `canonicalize()` rather than plain string prefix checks because on
/// Windows it returns the `\\?\`-prefixed extended-length form — comparing a
/// canonicalized path against a non-canonicalized one would spuriously fail
/// `starts_with`, so both sides must go through the same canonicalization.
fn ensure_within_project(dest: &Path, project_path: &Path) -> Result<()> {
    let Some(parent) = dest.parent() else {
        return Err(InkwellError::Validation("Invalid asset path".into()));
    };
    // Reject traversal components before touching the filesystem at all — the
    // canonicalize+starts_with check below is the real guarantee, but this
    // fails fast without creating any directory first.
    if parent
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(InkwellError::Validation(
            "Asset path escapes project directory".into(),
        ));
    }
    std::fs::create_dir_all(parent)?;
    let canonical_parent = parent.canonicalize()?;
    let canonical_project = project_path.canonicalize()?;
    if !canonical_parent.starts_with(&canonical_project) {
        return Err(InkwellError::Validation(
            "Asset path escapes project directory".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn add_entity_asset(
    state: State<'_, AppState>,
    entity_id: String,
    source_path: String,
    label: Option<String>,
) -> Result<EntityAsset> {
    let project_path = {
        let guard = state
            .project_path
            .lock()
            .map_err(|_| InkwellError::Internal("project_path lock poisoned".into()))?;
        guard
            .clone()
            .ok_or_else(|| InkwellError::Internal("No project is open".into()))?
    };

    if entity_id.len() != 26 || !entity_id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(InkwellError::Validation("Invalid entity ID format".into()));
    }

    let src = Path::new(&source_path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    const ALLOWED: &[&str] = &[
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "svg",
    ];
    if !ALLOWED.contains(&ext.as_str()) {
        return Err(InkwellError::Validation(format!(
            "Unsupported image format: .{ext}"
        )));
    }

    let out_ext = output_ext(&ext);
    let asset_ulid = ulid::Ulid::new().to_string();
    let relative_path = format!("assets/entities/{entity_id}/{asset_ulid}.{out_ext}");

    let dest = project_path.join(&relative_path);
    ensure_within_project(&dest, &project_path)?;
    resize_and_copy(src, &dest, &ext)?;

    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_asset_repo::insert(&conn, &entity_id, &relative_path, label.as_deref(), 0)
}

#[tauri::command]
pub async fn read_entity_asset(state: State<'_, AppState>, asset_id: String) -> Result<String> {
    let project_path = {
        let guard = state
            .project_path
            .lock()
            .map_err(|_| InkwellError::Internal("project_path lock poisoned".into()))?;
        guard
            .clone()
            .ok_or_else(|| InkwellError::Internal("No project is open".into()))?
    };

    let relative_path = {
        let conn = state
            .db
            .lock()
            .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
        entity_asset_repo::get_relative_path(&conn, &asset_id)?
            .ok_or_else(|| InkwellError::NotFound(format!("Asset {asset_id} not found")))?
    };

    // Every stored asset is re-encoded to JPEG at upload time (see output_ext).
    let bytes = std::fs::read(project_path.join(&relative_path))?;
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{encoded}"))
}

#[tauri::command]
pub async fn list_entity_assets(
    state: State<'_, AppState>,
    entity_id: String,
) -> Result<Vec<EntityAsset>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_asset_repo::list(&conn, &entity_id)
}

#[tauri::command]
pub async fn delete_entity_asset(state: State<'_, AppState>, asset_id: String) -> Result<()> {
    let project_path = {
        let guard = state
            .project_path
            .lock()
            .map_err(|_| InkwellError::Internal("project_path lock poisoned".into()))?;
        guard
            .clone()
            .ok_or_else(|| InkwellError::Internal("No project is open".into()))?
    };

    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    let relative_path = entity_asset_repo::delete(&conn, &asset_id)?;

    if let Some(path) = relative_path {
        let full = project_path.join(&path);
        match std::fs::remove_file(&full) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(InkwellError::Filesystem(e)),
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb, Rgba};
    use tempfile::TempDir;

    fn write_jpeg(dir: &Path, name: &str, width: u32, height: u32) -> std::path::PathBuf {
        let path = dir.join(name);
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(width, height);
        img.save(&path).unwrap();
        path
    }

    fn write_png(dir: &Path, name: &str, width: u32, height: u32) -> std::path::PathBuf {
        let path = dir.join(name);
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(width, height);
        img.save(&path).unwrap();
        path
    }

    fn write_noisy_jpeg(dir: &Path, name: &str, width: u32, height: u32) -> std::path::PathBuf {
        let path = dir.join(name);
        let img = ImageBuffer::from_fn(width, height, |x, y| {
            Rgb([
                (x * 37 % 256) as u8,
                (y * 59 % 256) as u8,
                ((x + y) * 83 % 256) as u8,
            ])
        });
        img.save(&path).unwrap();
        path
    }

    // ── dimension limits ─────────────────────────────────────────────────────

    #[test]
    fn high_megapixel_image_decodes_and_resizes() {
        // image::open()'s default decode Limits cap allocation at 512MiB.
        // A 15000x12000 RGBA8 source decodes to ~686MiB, past that default —
        // this reproduces a real report of large (high-megapixel) photos
        // silently failing to update. PNG is used here purely because a
        // uniform buffer deflates almost instantly (unlike JPEG's per-block
        // DCT, which would make this test slow); the decode path being
        // exercised is the same one every format goes through.
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "huge.png", 15000, 12000);
        let dest = dir.path().join("out.jpg"); // output is always JPEG regardless of input format
        resize_and_copy(&src, &dest, "png").unwrap();

        let img = image::open(&dest).unwrap();
        assert!(img.width() <= MAX_DIM);
        assert!(img.height() <= MAX_DIM);
    }

    #[test]
    fn high_megapixel_image_resizes_quickly() {
        // Regression guard: a single Lanczos3 pass on a very large downsampling
        // ratio widens its filter kernel proportionally and can take minutes (this
        // is what the earlier bug report — "large jpg images just don't update" —
        // turned out to be). The thumbnail-prefilter step must keep this fast.
        // 6000x4000 (24MP, a realistic "large photo") already has enough of a
        // downsampling ratio (~30x) to trigger the pathological case pre-fix,
        // without paying the setup cost of the 512MiB-boundary test above.
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "large_photo.jpg", 6000, 4000);
        let dest = dir.path().join("out.jpg");

        let start = std::time::Instant::now();
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let elapsed = start.elapsed();

        assert!(
            elapsed.as_secs() < 10,
            "resize took {elapsed:?}, expected well under 10s"
        );
    }

    #[test]
    fn small_jpeg_is_not_resized() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "small.jpg", 150, 100);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.width(), 150);
        assert_eq!(img.height(), 100);
    }

    #[test]
    fn wide_jpeg_is_resized_to_max_width() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "wide.jpg", 800, 400);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.width(), MAX_DIM);
        assert!(img.height() <= 100 + 1);
    }

    #[test]
    fn tall_jpeg_is_resized_to_max_height() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "tall.jpg", 400, 800);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.height(), MAX_DIM);
        assert!(img.width() <= 100 + 1);
    }

    #[test]
    fn large_png_is_resized() {
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "big.png", 4000, 2000);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "png").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.width(), MAX_DIM);
    }

    // ── format conversion ────────────────────────────────────────────────────

    #[test]
    fn png_is_converted_to_jpeg() {
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "icon.png", 100, 100);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "png").unwrap();
        let bytes = std::fs::read(&dest).unwrap();
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]); // JPEG magic bytes
    }

    #[test]
    fn transparent_png_composites_onto_white() {
        // write_png builds an all-zero RGBA buffer: fully transparent, with
        // (0,0,0) underneath. Naively dropping alpha (image's default
        // to_rgb8() conversion) would keep that raw black instead of showing
        // through to a sensible background — verify we composite onto white.
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "transparent.png", 50, 50);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "png").unwrap();

        let img = image::open(&dest).unwrap().to_rgb8();
        let pixel = img.get_pixel(25, 25);
        assert!(
            pixel.0.iter().all(|&c| c > 200),
            "expected a near-white pixel after compositing, got {:?}",
            pixel.0
        );
    }

    #[test]
    fn svg_is_rasterized_to_jpeg_and_capped() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("icon.svg");
        std::fs::write(
            &src,
            br##"<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
                <rect width="500" height="500" fill="#c9384c"/>
                <circle cx="250" cy="250" r="150" fill="#f2e6c9"/>
            </svg>"##,
        )
        .unwrap();
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "svg").unwrap();

        let bytes = std::fs::read(&dest).unwrap();
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]); // JPEG magic bytes
        assert!(bytes.len() <= MAX_OUTPUT_BYTES);

        let img = image::open(&dest).unwrap();
        assert!(img.width() <= MAX_DIM);
        assert!(img.height() <= MAX_DIM);
    }

    #[test]
    fn invalid_svg_is_rejected() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("broken.svg");
        std::fs::write(&src, b"not actually svg content").unwrap();
        let dest = dir.path().join("out.jpg");
        let err = resize_and_copy(&src, &dest, "svg").unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
    }

    #[test]
    fn gif_is_rasterized_to_jpeg_and_capped() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "temp.jpg", 400, 300); // build a frame, then re-save as GIF
        let frame = image::open(&src).unwrap();
        let gif_path = dir.path().join("anim.gif");
        frame
            .save_with_format(&gif_path, image::ImageFormat::Gif)
            .unwrap();

        let dest = dir.path().join("out.jpg");
        resize_and_copy(&gif_path, &dest, "gif").unwrap();

        let bytes = std::fs::read(&dest).unwrap();
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]);
        assert!(bytes.len() <= MAX_OUTPUT_BYTES);

        let img = image::open(&dest).unwrap();
        assert!(img.width() <= MAX_DIM);
        assert!(img.height() <= MAX_DIM);
    }

    #[test]
    fn invalid_gif_is_rejected() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("broken.gif");
        std::fs::write(&src, b"not actually a gif").unwrap();
        let dest = dir.path().join("out.jpg");
        let err = resize_and_copy(&src, &dest, "gif").unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
    }

    #[test]
    fn output_ext_always_jpg() {
        assert_eq!(output_ext("jpg"), "jpg");
        assert_eq!(output_ext("jpeg"), "jpg");
        assert_eq!(output_ext("png"), "jpg");
        assert_eq!(output_ext("svg"), "jpg");
        assert_eq!(output_ext("gif"), "jpg");
        assert_eq!(output_ext("webp"), "jpg");
        assert_eq!(output_ext("bmp"), "jpg");
        assert_eq!(output_ext("tiff"), "jpg");
    }

    // ── input size guard ─────────────────────────────────────────────────────

    #[test]
    fn input_too_large_is_rejected() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("huge.jpg");
        std::fs::write(&src, vec![0u8; (MAX_INPUT_BYTES + 1) as usize]).unwrap();
        let dest = dir.path().join("out.jpg");
        let err = resize_and_copy(&src, &dest, "jpg").unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
        assert!(err.to_string().contains("too large"));
    }

    // ── output size enforcement ───────────────────────────────────────────────

    #[test]
    fn jpeg_output_is_within_size_limit() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "photo.jpg", 800, 600);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let size = std::fs::metadata(&dest).unwrap().len() as usize;
        assert!(size <= MAX_OUTPUT_BYTES, "output was {size} bytes");
    }

    #[test]
    fn noisy_jpeg_fits_under_limit_after_resize_and_quality_reduction() {
        let dir = TempDir::new().unwrap();
        let src = write_noisy_jpeg(dir.path(), "noisy.jpg", 1600, 1200);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();

        let size = std::fs::metadata(&dest).unwrap().len() as usize;
        assert!(size <= MAX_OUTPUT_BYTES, "output was {size} bytes");

        let img = image::open(&dest).unwrap();
        assert!(img.width() <= MAX_DIM);
        assert!(img.height() <= MAX_DIM);
    }

    #[test]
    fn encode_jpeg_fails_when_output_cannot_fit() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "test.jpg", 100, 100);
        let img = image::open(&src).unwrap();
        let err = encode_jpeg_under_limit(&img, 1).unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
    }

    #[test]
    fn encode_jpeg_succeeds_within_normal_limit() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "test.jpg", 400, 300);
        let img = image::open(&src).unwrap();
        let bytes = encode_jpeg_under_limit(&img, MAX_OUTPUT_BYTES).unwrap();
        assert!(bytes.len() <= MAX_OUTPUT_BYTES);
    }

    // ── project path scope guard (Windows-sensitive: canonicalize() semantics) ──

    #[test]
    fn ensure_within_project_accepts_a_path_inside_the_project() {
        let project = TempDir::new().unwrap();
        let dest = project
            .path()
            .join("assets")
            .join("entities")
            .join("e1")
            .join("photo.jpg");
        ensure_within_project(&dest, project.path()).unwrap();
        assert!(dest.parent().unwrap().is_dir());
    }

    #[test]
    fn ensure_within_project_rejects_a_traversal_outside_the_project() {
        let root = TempDir::new().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let outside = root.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();

        // Escapes the project root via `..` before canonicalization resolves it.
        let dest = project.join("..").join("outside").join("photo.jpg");
        let err = ensure_within_project(&dest, &project).unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
    }

    #[test]
    fn ensure_within_project_rejects_traversal_without_creating_any_directory() {
        // The `..` component is rejected before create_dir_all runs at all — this
        // proves it, by pointing the escape at a directory that does not exist yet
        // and confirming it never gets created.
        let root = TempDir::new().unwrap();
        let project = root.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let never_created = root.path().join("should-not-be-created");

        let dest = project
            .join("..")
            .join("should-not-be-created")
            .join("x.jpg");
        let err = ensure_within_project(&dest, &project).unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
        assert!(!never_created.exists());
    }

    #[test]
    fn ensure_within_project_accepts_nested_nonexistent_subdirs() {
        // Mirrors the real call site: the entity/asset subdirectories don't exist
        // yet on first upload, only the project root does.
        let project = TempDir::new().unwrap();
        let dest = project
            .path()
            .join("assets")
            .join("entities")
            .join("brand-new-entity-id")
            .join("first-upload.jpg");
        assert!(!dest.parent().unwrap().exists());
        ensure_within_project(&dest, project.path()).unwrap();
        assert!(dest.parent().unwrap().is_dir());
    }
}

use std::path::Path;

use image::GenericImageView;
use tauri::State;

use crate::db::entity_asset_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity_asset::EntityAsset;
use crate::state::AppState;

const MAX_DIM: u32 = 1200;
const MAX_INPUT_BYTES: u64 = 20 * 1024 * 1024; // 20 MB — prevent OOM loading huge raws
const MAX_OUTPUT_BYTES: usize = 512 * 1024; // 512 KB — per-image budget in the project folder
const MAX_COPY_BYTES: u64 = 2 * 1024 * 1024; // 2 MB — for SVG / GIF copied as-is
const JPEG_QUALITIES: &[u8] = &[85, 70, 55, 40]; // try in order until output fits

fn output_ext(ext: &str) -> &str {
    match ext {
        "png" | "svg" | "gif" => ext,
        _ => "jpg",
    }
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

fn encode_png_checked(img: &image::DynamicImage, max_bytes: usize) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| InkwellError::Validation(e.to_string()))?;
    if buf.len() > max_bytes {
        return Err(InkwellError::Validation(format!(
            "PNG is still too large after resizing ({}KB, limit {}KB). Save as JPEG to reduce size.",
            buf.len() / 1024,
            max_bytes / 1024
        )));
    }
    Ok(buf)
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

    if matches!(ext, "svg" | "gif") {
        if input_size > MAX_COPY_BYTES {
            return Err(InkwellError::Validation(format!(
                "File is too large ({}KB). Maximum allowed is {}KB.",
                input_size / 1024,
                MAX_COPY_BYTES / 1024
            )));
        }
        std::fs::copy(src, dest)?;
        return Ok(());
    }

    let img = match image::open(src) {
        Ok(img) => img,
        Err(_) => {
            if input_size > MAX_OUTPUT_BYTES as u64 {
                return Err(InkwellError::Validation(
                    "Unsupported image format and file is too large to store directly.".into(),
                ));
            }
            std::fs::copy(src, dest)?;
            return Ok(());
        }
    };

    let (w, h) = img.dimensions();
    let img = if w > MAX_DIM || h > MAX_DIM {
        img.resize(MAX_DIM, MAX_DIM, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let bytes = if ext == "png" {
        encode_png_checked(&img, MAX_OUTPUT_BYTES)?
    } else {
        encode_jpeg_under_limit(&img, MAX_OUTPUT_BYTES)?
    };

    std::fs::write(dest, bytes)?;
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
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
        let canonical_parent = parent.canonicalize()?;
        let canonical_project = project_path.canonicalize()?;
        if !canonical_parent.starts_with(&canonical_project) {
            return Err(InkwellError::Validation(
                "Asset path escapes project directory".into(),
            ));
        }
    }
    resize_and_copy(src, &dest, &ext)?;

    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_asset_repo::insert(&conn, &entity_id, &relative_path, label.as_deref(), 0)
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => "image/jpeg",
    }
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

    let ext = Path::new(&relative_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = mime_for_ext(&ext);

    let bytes = std::fs::read(project_path.join(&relative_path))?;
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
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

    // ── dimension limits ─────────────────────────────────────────────────────

    #[test]
    fn small_jpeg_is_not_resized() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "small.jpg", 800, 600);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.width(), 800);
        assert_eq!(img.height(), 600);
    }

    #[test]
    fn wide_jpeg_is_resized_to_max_width() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "wide.jpg", 2400, 1000);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.width(), MAX_DIM);
        assert!(img.height() <= 500 + 1);
    }

    #[test]
    fn tall_jpeg_is_resized_to_max_height() {
        let dir = TempDir::new().unwrap();
        let src = write_jpeg(dir.path(), "tall.jpg", 600, 2400);
        let dest = dir.path().join("out.jpg");
        resize_and_copy(&src, &dest, "jpg").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.height(), MAX_DIM);
        assert!(img.width() <= 300 + 1);
    }

    #[test]
    fn large_png_is_resized() {
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "big.png", 3000, 2000);
        let dest = dir.path().join("out.png");
        resize_and_copy(&src, &dest, "png").unwrap();
        let img = image::open(&dest).unwrap();
        assert_eq!(img.width(), MAX_DIM);
    }

    // ── format preservation ──────────────────────────────────────────────────

    #[test]
    fn png_is_saved_as_png() {
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "icon.png", 100, 100);
        let dest = dir.path().join("out.png");
        resize_and_copy(&src, &dest, "png").unwrap();
        let bytes = std::fs::read(&dest).unwrap();
        assert_eq!(&bytes[0..4], b"\x89PNG");
    }

    #[test]
    fn svg_is_copied_unchanged() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("icon.svg");
        std::fs::write(&src, b"<svg/>").unwrap();
        let dest = dir.path().join("out.svg");
        resize_and_copy(&src, &dest, "svg").unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"<svg/>");
    }

    #[test]
    fn gif_is_copied_unchanged() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("anim.gif");
        let gif_bytes = b"GIF89a\x01\x00\x01\x00\x00\x00\x00\x3b";
        std::fs::write(&src, gif_bytes).unwrap();
        let dest = dir.path().join("out.gif");
        resize_and_copy(&src, &dest, "gif").unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), gif_bytes.to_vec());
    }

    #[test]
    fn output_ext_maps_correctly() {
        assert_eq!(output_ext("jpg"), "jpg");
        assert_eq!(output_ext("jpeg"), "jpg");
        assert_eq!(output_ext("png"), "png");
        assert_eq!(output_ext("svg"), "svg");
        assert_eq!(output_ext("gif"), "gif");
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

    #[test]
    fn large_svg_is_rejected() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("huge.svg");
        std::fs::write(&src, vec![b'x'; (MAX_COPY_BYTES + 1) as usize]).unwrap();
        let dest = dir.path().join("out.svg");
        let err = resize_and_copy(&src, &dest, "svg").unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
        assert!(err.to_string().contains("too large"));
    }

    #[test]
    fn large_gif_is_rejected() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("huge.gif");
        std::fs::write(&src, vec![b'G'; (MAX_COPY_BYTES + 1) as usize]).unwrap();
        let dest = dir.path().join("out.gif");
        let err = resize_and_copy(&src, &dest, "gif").unwrap_err();
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

    #[test]
    fn encode_png_over_limit_errors() {
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "test.png", 100, 100);
        let img = image::open(&src).unwrap();
        let err = encode_png_checked(&img, 1).unwrap_err();
        assert!(matches!(err, InkwellError::Validation(_)));
        assert!(err.to_string().contains("PNG"));
    }

    #[test]
    fn encode_png_within_limit_succeeds() {
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "test.png", 100, 100);
        let img = image::open(&src).unwrap();
        let bytes = encode_png_checked(&img, MAX_OUTPUT_BYTES).unwrap();
        assert!(bytes.len() <= MAX_OUTPUT_BYTES);
    }
}

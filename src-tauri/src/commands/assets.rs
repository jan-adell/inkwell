use std::path::Path;

use image::GenericImageView;
use tauri::State;

use crate::db::entity_asset_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity_asset::EntityAsset;
use crate::state::AppState;

const MAX_DIM: u32 = 1200;

fn output_ext(ext: &str) -> &str {
    match ext {
        "png" | "svg" | "gif" => ext,
        _ => "jpg",
    }
}

fn resize_and_copy(src: &Path, dest: &Path, ext: &str) -> Result<()> {
    if matches!(ext, "svg" | "gif") {
        std::fs::copy(src, dest)?;
        return Ok(());
    }

    let img = match image::open(src) {
        Ok(img) => img,
        Err(_) => {
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

    if ext == "png" {
        img.save_with_format(dest, image::ImageFormat::Png)
            .map_err(|e| InkwellError::Validation(e.to_string()))?;
    } else {
        use image::codecs::jpeg::JpegEncoder;
        let file = std::fs::File::create(dest)?;
        let encoder = JpegEncoder::new_with_quality(std::io::BufWriter::new(file), 85);
        img.write_with_encoder(encoder)
            .map_err(|e| InkwellError::Validation(e.to_string()))?;
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
    fn png_is_saved_as_png() {
        let dir = TempDir::new().unwrap();
        let src = write_png(dir.path(), "icon.png", 100, 100);
        let dest = dir.path().join("out.png");
        resize_and_copy(&src, &dest, "png").unwrap();
        let bytes = std::fs::read(&dest).unwrap();
        assert_eq!(&bytes[0..4], b"\x89PNG");
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
}

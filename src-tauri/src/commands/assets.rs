use std::path::Path;

use tauri::State;

use crate::db::entity_asset_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity_asset::EntityAsset;
use crate::state::AppState;

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

    let src = Path::new(&source_path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    let asset_ulid = ulid::Ulid::new().to_string();
    let relative_path = format!("assets/entities/{entity_id}/{asset_ulid}.{ext}");

    let dest = project_path.join(&relative_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(src, &dest)?;

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

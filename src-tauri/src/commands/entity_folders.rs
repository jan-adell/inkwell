use tauri::State;

use crate::db::entity_folder_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity_folder::{
    CreateEntityFolderRequest, EntityFolder, UpdateEntityFolderRequest,
};
use crate::state::AppState;

#[tauri::command]
pub async fn create_entity_folder(
    state: State<'_, AppState>,
    project_id: String,
    req: CreateEntityFolderRequest,
) -> Result<EntityFolder> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Entity folder name cannot be empty".into(),
        ));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_folder_repo::create(&conn, &project_id, &req)
}

#[tauri::command]
pub async fn list_entity_folders(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<EntityFolder>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_folder_repo::list(&conn, &project_id)
}

#[tauri::command]
pub async fn update_entity_folder(
    state: State<'_, AppState>,
    id: String,
    req: UpdateEntityFolderRequest,
) -> Result<EntityFolder> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_folder_repo::update(&conn, &id, &req)
}

#[tauri::command]
pub async fn delete_entity_folder(state: State<'_, AppState>, id: String) -> Result<()> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_folder_repo::delete(&conn, &id)
}

use tauri::State;

use crate::db::entity_type_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity_type::{
    CreateEntityTypeRequest, EntityType, UpdateEntityTypeRequest,
};
use crate::state::AppState;

#[tauri::command]
pub async fn create_entity_type(
    state: State<'_, AppState>,
    project_id: String,
    req: CreateEntityTypeRequest,
) -> Result<EntityType> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation("Entity type name cannot be empty".into()));
    }
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_type_repo::create(&conn, &project_id, &req)
}

#[tauri::command]
pub async fn get_entity_type(
    state: State<'_, AppState>,
    id: String,
) -> Result<EntityType> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_type_repo::get(&conn, &id)
}

#[tauri::command]
pub async fn list_entity_types(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<EntityType>> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_type_repo::list(&conn, &project_id)
}

#[tauri::command]
pub async fn update_entity_type(
    state: State<'_, AppState>,
    id: String,
    req: UpdateEntityTypeRequest,
) -> Result<EntityType> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_type_repo::update(&conn, &id, &req)
}

#[tauri::command]
pub async fn delete_entity_type(
    state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_type_repo::delete(&conn, &id)
}

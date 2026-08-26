use tauri::State;

use crate::db::entity_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity::{CreateEntityRequest, Entity, UpdateEntityRequest};
use crate::state::AppState;

#[tauri::command]
pub async fn create_entity(
    state: State<'_, AppState>,
    project_id: String,
    req: CreateEntityRequest,
) -> Result<Entity> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation("Entity name cannot be empty".into()));
    }
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::create(&conn, &project_id, &req)
}

#[tauri::command]
pub async fn get_entity(
    state: State<'_, AppState>,
    id: String,
) -> Result<Entity> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::get(&conn, &id)
}

#[tauri::command]
pub async fn list_entities(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<Entity>> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::list(&conn, &project_id)
}

#[tauri::command]
pub async fn list_entities_by_type(
    state: State<'_, AppState>,
    project_id: String,
    entity_type_id: String,
) -> Result<Vec<Entity>> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::list_by_type(&conn, &project_id, &entity_type_id)
}

#[tauri::command]
pub async fn update_entity(
    state: State<'_, AppState>,
    id: String,
    req: UpdateEntityRequest,
) -> Result<Entity> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::update(&conn, &id, &req)
}

#[tauri::command]
pub async fn delete_entity(
    state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::delete(&conn, &id)
}

use tauri::State;

use crate::db::relation_type_repo;
use crate::error::{InkwellError, Result};
use crate::models::relation_type::{
    CreateRelationTypeRequest, RelationType, UpdateRelationTypeRequest,
};
use crate::state::AppState;

#[tauri::command]
pub async fn create_relation_type(
    state: State<'_, AppState>,
    project_id: String,
    req: CreateRelationTypeRequest,
) -> Result<RelationType> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation("Relation type name cannot be empty".into()));
    }
    if req.label.trim().is_empty() {
        return Err(InkwellError::Validation("Relation type label cannot be empty".into()));
    }
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_type_repo::create(&conn, &project_id, &req)
}

#[tauri::command]
pub async fn get_relation_type(
    state: State<'_, AppState>,
    id: String,
) -> Result<RelationType> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_type_repo::get(&conn, &id)
}

#[tauri::command]
pub async fn list_relation_types(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<RelationType>> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_type_repo::list(&conn, &project_id)
}

#[tauri::command]
pub async fn update_relation_type(
    state: State<'_, AppState>,
    id: String,
    req: UpdateRelationTypeRequest,
) -> Result<RelationType> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_type_repo::update(&conn, &id, &req)
}

#[tauri::command]
pub async fn delete_relation_type(
    state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_type_repo::delete(&conn, &id)
}

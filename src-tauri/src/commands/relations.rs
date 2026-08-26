use tauri::State;

use crate::db::relation_repo;
use crate::error::{InkwellError, Result};
use crate::models::relation::{CreateRelationRequest, Relation};
use crate::state::AppState;

#[tauri::command]
pub async fn create_relation(
    state: State<'_, AppState>,
    project_id: String,
    req: CreateRelationRequest,
) -> Result<Relation> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_repo::create(&conn, &project_id, &req)
}

#[tauri::command]
pub async fn delete_relation(
    state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_repo::delete(&conn, &id)
}

#[tauri::command]
pub async fn list_outgoing_relations(
    state: State<'_, AppState>,
    entity_id: String,
) -> Result<Vec<Relation>> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_repo::list_outgoing(&conn, &entity_id)
}

#[tauri::command]
pub async fn list_incoming_relations(
    state: State<'_, AppState>,
    entity_id: String,
) -> Result<Vec<Relation>> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    relation_repo::list_incoming(&conn, &entity_id)
}

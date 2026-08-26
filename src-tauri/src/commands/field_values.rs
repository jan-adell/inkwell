use tauri::State;

use crate::db::field_value_repo;
use crate::error::{InkwellError, Result};
use crate::models::field_value::{FieldValue, SetFieldValueRequest};
use crate::state::AppState;

#[tauri::command]
pub async fn set_field_value(
    state: State<'_, AppState>,
    req: SetFieldValueRequest,
) -> Result<FieldValue> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_value_repo::set(&conn, &req)
}

#[tauri::command]
pub async fn get_field_values(
    state: State<'_, AppState>,
    entity_id: String,
) -> Result<Vec<FieldValue>> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_value_repo::get_for_entity(&conn, &entity_id)
}

#[tauri::command]
pub async fn delete_field_value(
    state: State<'_, AppState>,
    entity_id: String,
    field_def_id: String,
) -> Result<()> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_value_repo::delete(&conn, &entity_id, &field_def_id)
}

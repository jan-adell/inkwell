use tauri::State;

use crate::error::{InkwellError, Result};
use crate::services::export;
use crate::state::AppState;

#[tauri::command]
pub async fn export_book(
    state: State<'_, AppState>,
    project_id: String,
    format: String,
    dest_path: String,
) -> Result<()> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    let bytes = export::export_book(&conn, &project_id, &format)?;
    drop(conn);
    std::fs::write(&dest_path, bytes)?;
    Ok(())
}

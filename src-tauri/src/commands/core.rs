use tauri::Manager;

use crate::error::InkwellError;
use crate::state::AppState;

#[derive(Debug, serde::Serialize)]
pub struct InitResult {
    pub ok: bool,
    pub message: String,
}

/// `initialize_core` — the first Tauri command called on startup.
///
/// Seeds `AppState` with a placeholder in-memory connection so that
/// `app.manage()` is called exactly once before any CRUD command runs.
/// The real project connection is established in `open_project` or
/// `create_project` when the user explicitly picks a project.
#[tauri::command]
pub async fn initialize_core(app: tauri::AppHandle) -> Result<InitResult, InkwellError> {
    if app.try_state::<AppState>().is_none() {
        let conn = rusqlite::Connection::open_in_memory()?;
        app.manage(AppState::new(conn));
    }

    Ok(InitResult {
        ok: true,
        message: "Core initialized.".into(),
    })
}

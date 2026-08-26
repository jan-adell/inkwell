use std::sync::Mutex;

use rusqlite::Connection;

/// Global application state held by Tauri's state manager.
///
/// Accessed in commands via `state: tauri::State<'_, AppState>`.
/// The Mutex ensures exclusive access to the Connection from any async command.
///
/// rusqlite::Connection is Send but not Sync, so Mutex<Connection> is
/// the correct wrapper — it implements both Send and Sync.
///
/// Implementation note: this is a single-connection, single-project model.
/// Multi-project switching or lifecycle management is out of scope for 003.
pub struct AppState {
    /// The open SQLite connection for the active project.
    /// Acquired by commands via `state.db.lock().unwrap_or_else(|e| e.into_inner())`.
    pub db: Mutex<Connection>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        Self {
            db: Mutex::new(conn),
        }
    }
}

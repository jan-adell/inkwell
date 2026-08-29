use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub project_path: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        Self {
            db: Mutex::new(conn),
            project_path: Mutex::new(None),
        }
    }
}

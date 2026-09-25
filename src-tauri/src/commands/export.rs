use std::path::PathBuf;

use tauri::Manager;

use crate::db::{connection_manager::ConnectionManager, migrations, registry};
use crate::error::{InkwellError, Result};
use crate::services::export;

#[tauri::command]
pub async fn export_book(
    app: tauri::AppHandle,
    project_id: String,
    format: String,
    dest_path: String,
) -> Result<()> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })?;

    let projects = registry::load(&app_data_dir)?;
    let project = projects
        .iter()
        .find(|p| p.project_id == project_id)
        .ok_or_else(|| InkwellError::NotFound(format!("Project '{project_id}' not in registry")))?;
    let project_path = PathBuf::from(&project.path);

    let mut conn = ConnectionManager::open(&project_path.join("project.db"))?;
    migrations::run_pending_migrations(&mut conn)?;

    let bytes = export::export_book(&conn, &project_id, &format)?;
    std::fs::write(&dest_path, bytes)?;
    Ok(())
}

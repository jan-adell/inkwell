use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::{Manager, State};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::registry::KnownProject;
use crate::db::{connection_manager::ConnectionManager, migrations, registry};
use crate::error::InkwellError;
use crate::state::AppState;

use super::projects_types::{OpenProjectResult, ProjectDto, ProjectUpdateDto};

fn add_dir_to_zip(
    zip: &mut ZipWriter<File>,
    dir: &Path,
    prefix: &Path,
    options: SimpleFileOptions,
) -> Result<(), InkwellError> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path.strip_prefix(prefix).unwrap();
        let name = rel.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            zip.add_directory(format!("{name}/"), options)
                .map_err(|e| InkwellError::Internal(e.to_string()))?;
            add_dir_to_zip(zip, &path, prefix, options)?;
        } else {
            zip.start_file(&name, options)
                .map_err(|e| InkwellError::Internal(e.to_string()))?;
            let mut f = File::open(&path)?;
            io::copy(&mut f, zip)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn export_project(
    app: tauri::AppHandle,
    project_id: String,
    dest_path: String,
) -> Result<(), InkwellError> {
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

    let dest_file = File::create(&dest_path)?;
    let mut zip = ZipWriter::new(dest_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    add_dir_to_zip(&mut zip, &project_path, &project_path, options)?;
    zip.finish()
        .map_err(|e| InkwellError::Internal(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub async fn import_project(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    archive_path: String,
) -> Result<OpenProjectResult, InkwellError> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })?;

    let new_folder_id = ulid::Ulid::new().to_string();
    let project_dir = app_data_dir
        .join("projects")
        .join(format!("{new_folder_id}.inkwell"));
    std::fs::create_dir_all(&project_dir)?;

    let extract_result = (|| -> Result<(), InkwellError> {
        let archive_file = File::open(&archive_path)?;
        let mut archive =
            ZipArchive::new(archive_file).map_err(|e| InkwellError::Internal(e.to_string()))?;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| InkwellError::Internal(e.to_string()))?;
            let name = entry.name().to_string();
            // Reject backslash-separated paths (Windows archives on any platform)
            // and any component that could escape the project directory.
            if name.contains('\\') {
                return Err(InkwellError::Validation(format!(
                    "Unsafe path in archive: {name}"
                )));
            }
            let candidate = std::path::Path::new(&name);
            for component in candidate.components() {
                match component {
                    std::path::Component::Normal(_) | std::path::Component::CurDir => {}
                    _ => {
                        return Err(InkwellError::Validation(format!(
                            "Unsafe path in archive: {name}"
                        )));
                    }
                }
            }
            let outpath = project_dir.join(candidate);
            if entry.is_dir() {
                std::fs::create_dir_all(&outpath)?;
            } else {
                if let Some(parent) = outpath.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut outfile = File::create(&outpath)?;
                io::copy(&mut entry, &mut outfile)?;
            }
        }
        Ok(())
    })();

    if let Err(e) = extract_result {
        let _ = std::fs::remove_dir_all(&project_dir);
        return Err(e);
    }

    let meta_raw = std::fs::read_to_string(project_dir.join("meta.json"))?;
    let meta: serde_json::Value = serde_json::from_str(&meta_raw)?;
    let project_id = meta["project_id"]
        .as_str()
        .ok_or_else(|| InkwellError::Migration("meta.json missing project_id".into()))?
        .to_string();
    let project_name = meta["project_name"]
        .as_str()
        .unwrap_or("Imported Project")
        .to_string();

    let db_path = project_dir.join("project.db");
    let mut new_conn = ConnectionManager::open(&db_path)?;
    let schema_version = migrations::run_pending_migrations(&mut new_conn)?;

    registry::register(&app_data_dir, &project_id, &project_name, &project_dir)?;

    let mut conn_guard = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    *conn_guard = new_conn;

    Ok(OpenProjectResult {
        project_id,
        project_name,
        schema_version,
    })
}

#[tauri::command]
pub async fn delete_project(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), InkwellError> {
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

    // If the project being deleted is the currently open one, swap to an
    // in-memory connection so the file handle is released before we remove
    // the directory. This matters on Windows, where an open handle blocks
    // remove_dir_all, and is clean on all platforms.
    {
        let mut conn_guard = state
            .db
            .lock()
            .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
        let is_active = conn_guard
            .query_row(
                "SELECT id FROM projects WHERE id = ?1",
                rusqlite::params![project_id],
                |r| r.get::<_, String>(0),
            )
            .is_ok();
        if is_active {
            *conn_guard = Connection::open_in_memory()?;
        }
    }

    registry::remove(&app_data_dir, &project_id)?;
    if project_path.exists() {
        std::fs::remove_dir_all(&project_path)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn create_project(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<OpenProjectResult, InkwellError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(InkwellError::Validation(
            "project name cannot be empty".into(),
        ));
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })?;

    let project_id = ulid::Ulid::new().to_string();
    let project_dir = app_data_dir
        .join("projects")
        .join(format!("{project_id}.inkwell"));

    for dir in &[
        project_dir.as_path(),
        &project_dir.join("assets/characters"),
        &project_dir.join("assets/maps"),
        &project_dir.join("assets/covers"),
    ] {
        std::fs::create_dir_all(dir)?;
    }

    let now = chrono::Utc::now().to_rfc3339();
    let db_path = project_dir.join("project.db");
    let mut new_conn = ConnectionManager::open(&db_path)?;
    let schema_version = migrations::run_pending_migrations(&mut new_conn)?;

    let meta = crate::models::ProjectMeta {
        inkwell_schema: schema_version,
        project_id: project_id.clone(),
        project_name: name.clone(),
        created_at: now,
        app_version: crate::models::ProjectMeta::APP_VERSION.into(),
    };
    std::fs::write(
        project_dir.join("meta.json"),
        serde_json::to_string_pretty(&meta)?,
    )?;

    crate::db::project_repo::create(&new_conn, &project_id, &name)?;
    registry::register(&app_data_dir, &project_id, &name, &project_dir)?;

    let mut conn_guard = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    *conn_guard = new_conn;

    Ok(OpenProjectResult {
        project_id,
        project_name: name,
        schema_version,
    })
}

#[tauri::command]
pub async fn open_project(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<OpenProjectResult, InkwellError> {
    let project_path = PathBuf::from(&path);
    let db_path = project_path.join("project.db");

    let mut new_conn = ConnectionManager::open(&db_path)?;
    let schema_version = migrations::run_pending_migrations(&mut new_conn)?;

    let meta_path = project_path.join("meta.json");
    let meta_raw = std::fs::read_to_string(&meta_path)?;
    let meta: serde_json::Value = serde_json::from_str(&meta_raw)?;
    let project_id = meta["project_id"]
        .as_str()
        .ok_or_else(|| InkwellError::Migration("meta.json missing project_id".into()))?
        .to_string();
    let project_name = meta["project_name"]
        .as_str()
        .unwrap_or("Untitled")
        .to_string();

    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })?;
    registry::register(&app_data_dir, &project_id, &project_name, &project_path)?;

    let mut conn_guard = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    *conn_guard = new_conn;

    Ok(OpenProjectResult {
        project_id,
        project_name,
        schema_version,
    })
}

#[tauri::command]
pub async fn list_known_projects(app: tauri::AppHandle) -> Result<Vec<KnownProject>, InkwellError> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })?;
    let projects = crate::db::registry::load(&app_data_dir)?;
    let valid: Vec<KnownProject> = projects
        .into_iter()
        .filter(|p| std::path::Path::new(&p.path).exists())
        .collect();
    Ok(valid)
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectDto>, InkwellError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    let rows = crate::db::project_repo::list(&conn, None)?;
    Ok(rows
        .into_iter()
        .map(|r| ProjectDto {
            id: r.id,
            name: r.name,
            description: r.description,
            created_at: r.created_at,
            updated_at: r.updated_at,
            settings: r.settings,
        })
        .collect())
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    p: ProjectUpdateDto,
) -> Result<ProjectDto, InkwellError> {
    if p.name.trim().is_empty() {
        return Err(InkwellError::Validation("name cannot be empty".into()));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    let updated = crate::db::project_repo::update(
        &conn,
        &p.id,
        &p.name,
        p.description.as_deref(),
        p.settings.as_deref(),
    )?;
    Ok(ProjectDto {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
        settings: updated.settings,
    })
}

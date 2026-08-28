use tauri::{Manager, State};

use crate::db::{blob_store, document_blob, document_repo};
use crate::error::{InkwellError, Result};
use crate::models::document::{CreateDocumentRequest, Document, UpdateDocumentRequest};
use crate::state::AppState;

#[tauri::command]
pub async fn create_document(
    state: State<'_, AppState>,
    project_id: String,
    req: CreateDocumentRequest,
) -> Result<Document> {
    if req.title.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Document title cannot be empty".into(),
        ));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_repo::create(&conn, &project_id, &req)
}

#[tauri::command]
pub async fn get_document(state: State<'_, AppState>, id: String) -> Result<Document> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_repo::get(&conn, &id)
}

#[tauri::command]
pub async fn list_root_documents(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<Document>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_repo::list_root(&conn, &project_id)
}

#[tauri::command]
pub async fn list_child_documents(
    state: State<'_, AppState>,
    parent_id: String,
) -> Result<Vec<Document>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_repo::list_children(&conn, &parent_id)
}

#[tauri::command]
pub async fn update_document(
    state: State<'_, AppState>,
    id: String,
    req: UpdateDocumentRequest,
) -> Result<Document> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_repo::update(&conn, &id, &req)
}

#[tauri::command]
pub async fn delete_document(state: State<'_, AppState>, id: String) -> Result<()> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_repo::delete(&conn, &id)
}

#[tauri::command]
pub async fn write_document_blob(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    document_id: String,
    content_text: String,
    blob_relative_path: String,
) -> Result<()> {
    let project_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            InkwellError::Filesystem(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                e.to_string(),
            ))
        })?
        .join("default_project");
    blob_store::write_blob(
        &project_dir,
        std::path::Path::new(&blob_relative_path),
        &content_text,
    )?;
    let mut conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_blob::update_document_content_blob(
        &mut conn,
        &document_id,
        &content_text,
        Some(&blob_relative_path),
    )
}

#[tauri::command]
pub async fn read_document_blob(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    document_id: String,
) -> Result<String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    let blob_path: Option<String> = conn
        .query_row(
            "SELECT blob_path FROM document_contents WHERE document_id = ?1",
            rusqlite::params![document_id],
            |r| r.get(0),
        )
        .map_err(InkwellError::Database)?;
    drop(conn);
    let rel = blob_path
        .ok_or_else(|| InkwellError::NotFound(format!("Document '{document_id}' has no blob")))?;
    let project_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            InkwellError::Filesystem(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                e.to_string(),
            ))
        })?
        .join("default_project");
    blob_store::read_blob(&project_dir, std::path::Path::new(&rel))
}

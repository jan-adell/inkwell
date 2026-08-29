use tauri::State;

use crate::db::{document_blob, document_repo};
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
pub async fn write_document_content(
    state: State<'_, AppState>,
    document_id: String,
    content_json: String,
    content_text: String,
) -> Result<()> {
    let mut conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_blob::update_document_content(&mut conn, &document_id, &content_json, &content_text)
}

#[tauri::command]
pub async fn read_document_content(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<String> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    document_blob::get_document_content(&conn, &document_id)
}

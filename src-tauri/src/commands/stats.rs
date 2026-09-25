use tauri::State;

use crate::db::{document_repo, entity_repo};
use crate::error::{InkwellError, Result};
use crate::state::AppState;

#[derive(Debug, serde::Serialize)]
pub struct DocumentWordCount {
    pub id: String,
    pub title: String,
    pub word_count: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct ProjectStats {
    pub entity_count: i64,
    pub document_count: i64,
    pub total_word_count: i64,
    pub documents: Vec<DocumentWordCount>,
}

#[tauri::command]
pub async fn get_project_stats(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<ProjectStats> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;

    let entity_count = entity_repo::list(&conn, &project_id)?.len() as i64;
    let documents = document_repo::list_all_content(&conn, &project_id)?;
    let total_word_count = documents.iter().map(|d| d.word_count).sum();
    let documents = documents
        .into_iter()
        .map(|d| DocumentWordCount {
            id: d.id,
            title: d.title,
            word_count: d.word_count,
        })
        .collect::<Vec<_>>();

    Ok(ProjectStats {
        entity_count,
        document_count: documents.len() as i64,
        total_word_count,
        documents,
    })
}

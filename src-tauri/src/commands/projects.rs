use tauri::State;

use crate::error::InkwellError;
use crate::state::AppState;

use super::projects_types::{ProjectDto, ProjectUpdateDto};

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectDto>, InkwellError> {
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
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
    let conn = state.db.lock().map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    let updated = crate::db::project_repo::update(&conn, &p.id, &p.name, p.description.as_deref(), p.settings.as_deref())?;
    Ok(ProjectDto {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
        settings: updated.settings,
    })
}

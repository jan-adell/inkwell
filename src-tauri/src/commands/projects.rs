use crate::error::InkwellError;
use crate::models::ProjectMeta;
use crate::state::AppState;

use super::projects_types::{ProjectDto, ProjectUpdateDto};

#[tauri::command]
pub async fn list_projects(app: tauri::AppHandle) -> Result<Vec<ProjectDto>, InkwellError> {
    let state = app.state::<AppState>();
    let conn = state.get_conn()?;
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
    app: tauri::AppHandle,
    p: ProjectUpdateDto,
) -> Result<ProjectDto, InkwellError> {
    let state = app.state::<AppState>();
    let conn = state.get_conn()?;

    // Basic validation
    if p.name.trim().is_empty() {
        return Err(InkwellError::Validation("name cannot be empty".into()));
    }

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

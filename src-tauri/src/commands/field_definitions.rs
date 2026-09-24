use tauri::State;

use crate::db::{entity_asset_repo, field_definition_repo};
use crate::error::{InkwellError, Result};
use crate::models::field_definition::{
    CreateFieldDefinitionRequest, FieldDefinition, UpdateFieldDefinitionRequest,
};
use crate::state::AppState;

#[tauri::command]
pub async fn create_field_definition(
    state: State<'_, AppState>,
    req: CreateFieldDefinitionRequest,
) -> Result<FieldDefinition> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Field name cannot be empty".into(),
        ));
    }
    if req.label.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Field label cannot be empty".into(),
        ));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_definition_repo::create(&conn, &req)
}

#[tauri::command]
pub async fn list_field_definitions(
    state: State<'_, AppState>,
    entity_type_id: String,
) -> Result<Vec<FieldDefinition>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_definition_repo::list(&conn, &entity_type_id)
}

#[tauri::command]
pub async fn update_field_definition(
    state: State<'_, AppState>,
    id: String,
    req: UpdateFieldDefinitionRequest,
) -> Result<FieldDefinition> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_definition_repo::update(&conn, &id, &req)
}

#[tauri::command]
pub async fn delete_field_definition(state: State<'_, AppState>, id: String) -> Result<()> {
    let project_path = state
        .project_path
        .lock()
        .map_err(|_| InkwellError::Internal("project_path lock poisoned".into()))?
        .clone();

    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;

    // For an image field, `entity_assets.label` holds this field def's id — delete
    // any image stored under it, on disk and in the DB, before dropping the field
    // itself. Otherwise the file and row are orphaned forever.
    for asset in entity_asset_repo::list_by_label(&conn, &id)? {
        entity_asset_repo::delete(&conn, &asset.id)?;
        if let Some(ref project_path) = project_path {
            let full = project_path.join(&asset.relative_path);
            match std::fs::remove_file(&full) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(InkwellError::Filesystem(e)),
            }
        }
    }

    field_definition_repo::delete(&conn, &id)
}

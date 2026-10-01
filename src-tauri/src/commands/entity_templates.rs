use tauri::Manager;

use crate::db::entity_templates;
use crate::error::{InkwellError, Result};
use crate::models::entity_template::{
    CreateEntityTemplateRequest, EntityTemplate, UpdateEntityTemplateRequest,
};

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            e.to_string(),
        ))
    })
}

#[tauri::command]
pub async fn list_entity_templates(app: tauri::AppHandle) -> Result<Vec<EntityTemplate>> {
    entity_templates::load(&app_data_dir(&app)?)
}

#[tauri::command]
pub async fn create_entity_template(
    app: tauri::AppHandle,
    req: CreateEntityTemplateRequest,
) -> Result<EntityTemplate> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Entity type name cannot be empty".into(),
        ));
    }
    entity_templates::create(&app_data_dir(&app)?, &req)
}

#[tauri::command]
pub async fn update_entity_template(
    app: tauri::AppHandle,
    id: String,
    req: UpdateEntityTemplateRequest,
) -> Result<EntityTemplate> {
    if let Some(ref name) = req.name {
        if name.trim().is_empty() {
            return Err(InkwellError::Validation(
                "Entity type name cannot be empty".into(),
            ));
        }
    }
    entity_templates::update(&app_data_dir(&app)?, &id, &req)
}

#[tauri::command]
pub async fn delete_entity_template(app: tauri::AppHandle, id: String) -> Result<()> {
    entity_templates::delete(&app_data_dir(&app)?, &id)
}

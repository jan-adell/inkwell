use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityFolder {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEntityFolderRequest {
    pub name: String,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEntityFolderRequest {
    pub name: Option<String>,
    pub sort_order: Option<i64>,
}

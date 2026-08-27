use serde::{Deserialize, Serialize};

/// A user-defined category of world element.
/// Maps to the `entity_types` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityType {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub name_plural: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub description: Option<String>,
    pub is_system: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// Input for creating a new entity type.
#[derive(Debug, Deserialize)]
pub struct CreateEntityTypeRequest {
    pub name: String,
    pub name_plural: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub description: Option<String>,
    pub sort_order: Option<i64>,
}

/// Input for updating an existing entity type.
#[derive(Debug, Deserialize)]
pub struct UpdateEntityTypeRequest {
    pub name: Option<String>,
    pub name_plural: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub description: Option<String>,
    pub sort_order: Option<i64>,
}

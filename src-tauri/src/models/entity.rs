use serde::{Deserialize, Serialize};

/// A concrete world element: a character, location, faction, etc.
/// Maps to the `entities` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,
    pub project_id: String,
    pub entity_type_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub cover_image: Option<String>,   // relative path within assets/
    pub visibility: String,            // 'private' | 'beta' | 'public'
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// Input for creating an entity.
#[derive(Debug, Deserialize)]
pub struct CreateEntityRequest {
    pub entity_type_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
}

/// Input for updating an entity's metadata.
#[derive(Debug, Deserialize)]
pub struct UpdateEntityRequest {
    pub name: Option<String>,
    pub summary: Option<String>,
    pub cover_image: Option<String>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
}

use serde::{Deserialize, Serialize};

/// A user-defined directed relationship label: "vive_en", "posee", etc.
/// Maps to the `relation_types` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationType {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub label: String,
    pub inverse_name: Option<String>,
    pub inverse_label: Option<String>,
    pub allowed_source_types: Option<String>, // JSON: [ulid, …] or null
    pub allowed_target_types: Option<String>, // JSON: [ulid, …] or null
    pub color: Option<String>,
    pub is_system: bool,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

/// Input for creating a relation type.
#[derive(Debug, Deserialize)]
pub struct CreateRelationTypeRequest {
    pub name: String,
    pub label: String,
    pub inverse_name: Option<String>,
    pub inverse_label: Option<String>,
    pub allowed_source_types: Option<String>,
    pub allowed_target_types: Option<String>,
    pub color: Option<String>,
}

/// Input for updating a relation type.
#[derive(Debug, Deserialize)]
pub struct UpdateRelationTypeRequest {
    pub name: Option<String>,
    pub label: Option<String>,
    pub inverse_name: Option<String>,
    pub inverse_label: Option<String>,
    pub allowed_source_types: Option<String>,
    pub allowed_target_types: Option<String>,
    pub color: Option<String>,
}

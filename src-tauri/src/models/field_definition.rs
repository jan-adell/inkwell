use serde::{Deserialize, Serialize};

/// Valid field types — mirrors the values accepted by the schema.
pub const VALID_FIELD_TYPES: &[&str] = &[
    "text",
    "textarea",
    "number",
    "boolean",
    "date",
    "select",
    "multiselect",
    "entity_ref",
    "url",
    "color",
];

/// A custom field definition for an entity type.
/// Maps to the `field_definitions` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDefinition {
    pub id: String,
    pub entity_type_id: String,
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>, // JSON array for select/multiselect
    pub default_value: Option<String>,
    pub is_required: bool,
    pub visibility: String, // 'private' | 'beta' | 'public'
    pub sort_order: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

/// Input for creating a field definition.
#[derive(Debug, Deserialize)]
pub struct CreateFieldDefinitionRequest {
    pub entity_type_id: String,
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
    pub is_required: Option<bool>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
}

/// Input for updating a field definition.
#[derive(Debug, Deserialize)]
pub struct UpdateFieldDefinitionRequest {
    pub label: Option<String>,
    pub options: Option<String>,
    pub default_value: Option<String>,
    pub is_required: Option<bool>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
}

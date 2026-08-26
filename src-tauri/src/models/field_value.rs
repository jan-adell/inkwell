use serde::{Deserialize, Serialize};

/// One field value for one entity.
/// Maps to the `field_values` table.
/// Only one of the five value columns is non-None at a time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldValue {
    pub id: String,
    pub entity_id: String,
    pub field_def_id: String,
    pub value_text: Option<String>,
    pub value_number: Option<f64>,
    pub value_boolean: Option<bool>,
    pub value_date: Option<String>,
    pub value_json: Option<String>,
    pub updated_at: String,
}

/// The typed value supplied when setting a field.
/// The variant must match the field_definition.field_type.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type", content = "value")]
pub enum FieldValueInput {
    Text(String),
    Number(f64),
    Boolean(bool),
    Date(String),       // ISO 8601
    Json(String),       // raw JSON string
}

/// Request to set (upsert) a field value on an entity.
#[derive(Debug, Deserialize)]
pub struct SetFieldValueRequest {
    pub entity_id: String,
    pub field_def_id: String,
    pub value: FieldValueInput,
}

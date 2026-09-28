use serde::{Deserialize, Serialize};

/// A single default property definition within an entity template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultField {
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
}

/// An application-level entity type template: a name, a color, and a set of
/// default properties applied to any entity created with a matching type
/// name. Stored in entity_templates.json in the app's data directory —
/// never written into any project's own database.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct EntityTemplate {
    pub id: String,
    pub name: String,
    pub name_plural: String,
    pub color: String,
    pub fields: Vec<DefaultField>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct CreateEntityTemplateRequest {
    pub name: String,
    pub name_plural: String,
    pub color: String,
    pub fields: Vec<DefaultField>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct UpdateEntityTemplateRequest {
    pub name: Option<String>,
    pub name_plural: Option<String>,
    pub color: Option<String>,
    pub fields: Option<Vec<DefaultField>>,
}

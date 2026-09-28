use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultField {
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
}

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

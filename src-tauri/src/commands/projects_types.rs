use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct OpenProjectResult {
    pub project_id: String,
    pub project_name: String,
    pub schema_version: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectDto {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub settings: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectUpdateDto {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub settings: Option<String>,
}

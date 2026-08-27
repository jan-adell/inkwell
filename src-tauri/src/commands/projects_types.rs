use serde::{Deserialize, Serialize};

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

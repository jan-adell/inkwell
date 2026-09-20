use serde::{Deserialize, Serialize};

pub const VALID_NODE_TYPES: &[&str] = &["scene", "note", "document", "folder"];
pub const VALID_STATUSES: &[&str] = &["idea", "draft", "revision", "final"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub project_id: String,
    pub parent_id: Option<String>,
    pub node_type: String,
    pub title: String,
    pub synopsis: Option<String>,
    pub status: String,
    pub word_count: i64,
    pub sort_order: i64,
    pub is_included: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDocumentRequest {
    pub parent_id: Option<String>,
    pub node_type: String,
    pub title: String,
    pub synopsis: Option<String>,
    pub status: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDocumentRequest {
    pub title: Option<String>,
    pub synopsis: Option<String>,
    pub status: Option<String>,
    pub sort_order: Option<i64>,
    pub is_included: Option<bool>,
    pub parent_id: Option<Option<String>>,
}

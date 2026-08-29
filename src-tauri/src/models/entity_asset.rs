use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityAsset {
    pub id: String,
    pub entity_id: String,
    pub relative_path: String,
    pub label: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
}

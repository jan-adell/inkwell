use serde::{Deserialize, Serialize};

/// A directed edge in the knowledge graph: source → relation_type → target.
/// Maps to the `relations` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relation {
    pub id: String,
    pub project_id: String,
    pub source_entity_id: String,
    pub relation_type_id: String,
    pub target_entity_id: String,
    pub notes: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

/// Input for creating a relation.
#[derive(Debug, Deserialize)]
pub struct CreateRelationRequest {
    pub source_entity_id: String,
    pub relation_type_id: String,
    pub target_entity_id: String,
    pub notes: Option<String>,
    pub sort_order: Option<i64>,
}

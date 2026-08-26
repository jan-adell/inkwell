use serde::{Deserialize, Serialize};

/// The content of a document node (TipTap/ProseMirror JSON).
/// Maps to the `document_contents` table (1:1 with documents).
///
/// content_json: canonical TipTap/ProseMirror JSON document.
/// content_text: plain text extracted from content_json — used for FTS5.
///              Updated whenever content_json is saved.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct DocumentContent {
    pub document_id: String,
    pub content_json: String,
    pub content_text: String,
    pub updated_at: String,
}

/// The empty ProseMirror document — used when creating a new document.
pub const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[]}"#;

pub mod parser;
pub mod render_epub;
pub mod render_pdf;
pub mod render_txt;
pub mod tree;

use rusqlite::Connection;

use crate::db::document_blob;
use crate::error::{InkwellError, Result};

pub fn export_book(conn: &Connection, project_id: &str, format: &str) -> Result<Vec<u8>> {
    let documents = tree::flatten_book(conn, project_id)?;
    let mut blocks = Vec::with_capacity(documents.len());
    for document in &documents {
        let content_json = document_blob::get_document_content(conn, &document.id)?;
        blocks.push(parser::parse_blocks(&content_json)?);
    }

    match format {
        "txt" => Ok(render_txt::blocks_to_txt(&blocks).into_bytes()),
        "pdf" => render_pdf::blocks_to_pdf(&blocks),
        "epub" => render_epub::blocks_to_epub(&blocks),
        other => Err(InkwellError::Validation(format!(
            "Invalid export format '{other}'"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};
    use crate::models::document::CreateDocumentRequest;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
        conn
    }

    #[test]
    fn rejects_unknown_format() {
        let conn = test_conn();
        crate::db::project_repo::create(&conn, "proj-1", "P").unwrap();
        let result = export_book(&conn, "proj-1", "docx");
        assert!(matches!(result, Err(InkwellError::Validation(_))));
    }

    #[test]
    fn exports_txt_for_a_simple_project() {
        let mut conn = test_conn();
        crate::db::project_repo::create(&conn, "proj-1", "P").unwrap();
        let doc = crate::db::document_repo::create(
            &conn,
            "proj-1",
            &CreateDocumentRequest {
                parent_id: None,
                node_type: "document".into(),
                title: "Chapter One".into(),
                synopsis: None,
                status: None,
                sort_order: None,
            },
        )
        .unwrap();
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}"#;
        document_blob::update_document_content(&mut conn, &doc.id, json, "Hello").unwrap();

        let bytes = export_book(&conn, "proj-1", "txt").unwrap();
        assert_eq!(String::from_utf8(bytes).unwrap(), "Hello\n");
    }
}

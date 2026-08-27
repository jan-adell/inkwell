use std::path::Path;
use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};

/// Extended document helpers that include blob_path-aware updates.

use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};

pub fn update_document_content_blob(
    conn: &Connection,
    document_id: &str,
    content_text: &str,
    blob_path: Option<&str>,
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE document_contents SET content_text = ?1, updated_at = ?2, blob_path = ?3 WHERE document_id = ?4",
        params![content_text, now, blob_path, document_id],
    )?;

    // Update FTS table for the document (simple replace pattern)
    tx.execute("DELETE FROM fts_documents WHERE document_id = ?1", params![document_id])?;
    tx.execute(
        "INSERT INTO fts_documents(document_id, title, content_text) VALUES(?1, '', ?2)",
        params![document_id, content_text],
    )?;

    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn update_content_blob_roundtrip() {
        let conn = test_conn();

        // create project & document rows via existing APIs
        crate::db::project_repo::create(&conn, "proj-1", "P").unwrap();
        crate::db::documents::create(&conn, "doc-1", "proj-1", None, "chapter", "Title").unwrap();

        // insert document_contents
        conn.execute(
            "INSERT INTO document_contents(document_id, content_json, content_text, updated_at) VALUES(?1, ?2, ?3, ?4)",
            params!["doc-1", "{}", "hello world", chrono::Utc::now().to_rfc3339()],
        )
        .unwrap();

        update_document_content_blob(&conn, "doc-1", "hello updated", Some("content/documents/doc-1.json")).unwrap();

        let text: String = conn
            .query_row("SELECT content_text FROM document_contents WHERE document_id = ?1", params!["doc-1"], |r| r.get(0))
            .unwrap();

        assert_eq!(text, "hello updated");
    }
}

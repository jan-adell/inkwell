use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};

const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[]}"#;

pub fn update_document_content(
    conn: &mut Connection,
    document_id: &str,
    content_json: &str,
    content_text: &str,
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let word_count = content_text.split_whitespace().count() as i64;
    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE document_contents SET content_json = ?1, content_text = ?2, updated_at = ?3 WHERE document_id = ?4",
        params![content_json, content_text, now, document_id],
    )?;

    tx.execute(
        "UPDATE documents SET word_count = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
        params![word_count, now, document_id],
    )?;

    tx.execute(
        "DELETE FROM fts_documents WHERE document_id = ?1",
        params![document_id],
    )?;
    tx.execute(
        "INSERT INTO fts_documents(document_id, title, content_text) VALUES(?1, '', ?2)",
        params![document_id, content_text],
    )?;

    tx.commit()?;
    Ok(())
}

pub fn get_document_content(conn: &Connection, document_id: &str) -> Result<String> {
    let result = conn.query_row(
        "SELECT content_json FROM document_contents WHERE document_id = ?1",
        params![document_id],
        |r| r.get::<_, String>(0),
    );
    match result {
        Ok(json) => Ok(json),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(EMPTY_DOC_JSON.to_string()),
        Err(e) => Err(InkwellError::Database(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};
    use crate::models::document::CreateDocumentRequest;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
        conn
    }

    #[test]
    fn update_and_read_content_roundtrip() {
        let mut conn = test_conn();

        crate::db::project_repo::create(&conn, "proj-1", "P").unwrap();
        let doc = crate::db::document_repo::create(
            &conn,
            "proj-1",
            &CreateDocumentRequest {
                parent_id: None,
                node_type: "chapter".into(),
                title: "Chapter One".into(),
                synopsis: None,
                status: None,
                sort_order: None,
            },
        )
        .unwrap();

        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}"#;
        update_document_content(&mut conn, &doc.id, json, "Hello").unwrap();

        let read = get_document_content(&conn, &doc.id).unwrap();
        assert_eq!(read, json);
    }

    #[test]
    fn missing_document_returns_empty_doc() {
        let conn = test_conn();
        let result = get_document_content(&conn, "does-not-exist").unwrap();
        assert_eq!(result, EMPTY_DOC_JSON);
    }
}

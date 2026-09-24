use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::document::{
    CreateDocumentRequest, Document, UpdateDocumentRequest, VALID_NODE_TYPES, VALID_STATUSES,
};
use crate::models::document_content::EMPTY_DOC_JSON;

fn row_to_document(row: &rusqlite::Row) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get(0)?,
        project_id: row.get(1)?,
        parent_id: row.get(2)?,
        node_type: row.get(3)?,
        title: row.get(4)?,
        synopsis: row.get(5)?,
        status: row.get(6)?,
        word_count: row.get(7)?,
        sort_order: row.get(8)?,
        is_included: row.get::<_, i64>(9)? != 0,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateDocumentRequest,
) -> Result<Document> {
    if !VALID_NODE_TYPES.contains(&req.node_type.as_str()) {
        return Err(InkwellError::Validation(format!(
            "Invalid node_type '{}'",
            req.node_type
        )));
    }

    let status = req.status.as_deref().unwrap_or("draft");
    if !VALID_STATUSES.contains(&status) {
        return Err(InkwellError::Validation(format!(
            "Invalid status '{status}'"
        )));
    }

    if let Some(ref parent_id) = req.parent_id {
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM documents WHERE id=?1 AND project_id=?2 AND deleted_at IS NULL",
                params![parent_id, project_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !exists {
            return Err(InkwellError::Validation(format!(
                "Parent document '{parent_id}' does not exist"
            )));
        }
    }

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO documents (id,project_id,parent_id,node_type,title,synopsis,status,word_count,sort_order,is_included,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,1,?9,?9)",
        params![
            id,
            project_id,
            req.parent_id,
            req.node_type,
            req.title,
            req.synopsis,
            status,
            req.sort_order.unwrap_or(0),
            now,
        ],
    )?;
    tx.execute(
        "INSERT INTO document_contents(document_id,content_json,content_text,updated_at) VALUES (?1,?2,'',?3)",
        params![id, EMPTY_DOC_JSON, now],
    )?;
    tx.commit()?;
    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<Document> {
    conn.query_row(
        "SELECT id,project_id,parent_id,node_type,title,synopsis,status,word_count,sort_order,is_included,created_at,updated_at,deleted_at FROM documents WHERE id=?1",
        params![id],
        row_to_document,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("Document '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

fn list(conn: &Connection, sql: &str, id: &str) -> Result<Vec<Document>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![id], row_to_document)?;
    rows.map(|row| row.map_err(InkwellError::Database))
        .collect()
}

pub fn list_root(conn: &Connection, id: &str) -> Result<Vec<Document>> {
    list(
        conn,
        "SELECT id,project_id,parent_id,node_type,title,synopsis,status,word_count,sort_order,is_included,created_at,updated_at,deleted_at FROM documents WHERE project_id=?1 AND parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC,title ASC",
        id,
    )
}

pub fn list_children(conn: &Connection, id: &str) -> Result<Vec<Document>> {
    list(
        conn,
        "SELECT id,project_id,parent_id,node_type,title,synopsis,status,word_count,sort_order,is_included,created_at,updated_at,deleted_at FROM documents WHERE parent_id=?1 AND deleted_at IS NULL ORDER BY sort_order ASC,title ASC",
        id,
    )
}

pub fn update(conn: &Connection, id: &str, req: &UpdateDocumentRequest) -> Result<Document> {
    let current = get(conn, id)?;
    if let Some(ref status) = req.status {
        if !VALID_STATUSES.contains(&status.as_str()) {
            return Err(InkwellError::Validation(format!(
                "Invalid status '{status}'"
            )));
        }
    }

    let parent_id = match &req.parent_id {
        Some(inner) => inner.clone(),
        None => current.parent_id.clone(),
    };
    let title = req.title.as_deref().unwrap_or(&current.title);
    let synopsis = req.synopsis.as_deref().or(current.synopsis.as_deref());
    let status = req.status.as_deref().unwrap_or(&current.status);
    let sort_order = req.sort_order.unwrap_or(current.sort_order);
    let included = req.is_included.unwrap_or(current.is_included) as i64;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE documents SET parent_id=?1,title=?2,synopsis=?3,status=?4,sort_order=?5,is_included=?6,updated_at=?7 WHERE id=?8 AND deleted_at IS NULL",
        params![parent_id, title, synopsis, status, sort_order, included, now, id],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE documents SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}

pub fn list_all_content(conn: &Connection, id: &str) -> Result<Vec<Document>> {
    list(
        conn,
        "SELECT id,project_id,parent_id,node_type,title,synopsis,status,word_count,sort_order,is_included,created_at,updated_at,deleted_at FROM documents WHERE project_id=?1 AND node_type != 'folder' AND deleted_at IS NULL ORDER BY title ASC",
        id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        crate::db::migrations::ensure_migrations_table(&conn).unwrap();
        crate::db::migrations::run_pending_migrations(&mut conn).unwrap();
        conn
    }

    fn make_document(node_type: &str, title: &str) -> CreateDocumentRequest {
        CreateDocumentRequest {
            parent_id: None,
            node_type: node_type.into(),
            title: title.into(),
            synopsis: None,
            status: None,
            sort_order: None,
        }
    }

    #[test]
    fn list_all_content_excludes_folders_and_deleted() {
        let conn = test_conn();
        crate::db::project_repo::create(&conn, "proj-1", "P").unwrap();

        let doc = create(&conn, "proj-1", &make_document("document", "Chapter One")).unwrap();
        create(&conn, "proj-1", &make_document("scene", "Scene A")).unwrap();
        create(&conn, "proj-1", &make_document("folder", "Part I")).unwrap();
        let deleted = create(&conn, "proj-1", &make_document("note", "Old Note")).unwrap();
        delete(&conn, &deleted.id).unwrap();

        let contents = list_all_content(&conn, "proj-1").unwrap();
        let titles: Vec<&str> = contents.iter().map(|d| d.title.as_str()).collect();

        assert_eq!(contents.len(), 2);
        assert!(titles.contains(&"Chapter One"));
        assert!(titles.contains(&"Scene A"));
        assert!(!titles.contains(&"Part I"));
        assert!(!titles.contains(&"Old Note"));
        assert_eq!(
            contents.iter().find(|d| d.id == doc.id).unwrap().word_count,
            0
        );
    }
}

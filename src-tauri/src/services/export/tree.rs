use rusqlite::Connection;

use crate::db::document_repo;
use crate::error::Result;
use crate::models::document::Document;

pub fn flatten_book(conn: &Connection, project_id: &str) -> Result<Vec<Document>> {
    let mut out = Vec::new();
    let roots = document_repo::list_root(conn, project_id)?;
    walk(conn, roots, &mut out)?;
    Ok(out)
}

fn walk(conn: &Connection, nodes: Vec<Document>, out: &mut Vec<Document>) -> Result<()> {
    for node in nodes {
        if !node.is_included {
            continue;
        }
        let children = document_repo::list_children(conn, &node.id)?;
        let is_folder = node.node_type == "folder";
        if !is_folder {
            out.push(node);
        }
        if !children.is_empty() {
            walk(conn, children, out)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};
    use crate::models::document::{CreateDocumentRequest, UpdateDocumentRequest};

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
        conn
    }

    fn create(
        conn: &Connection,
        parent_id: Option<&str>,
        node_type: &str,
        title: &str,
        sort_order: i64,
    ) -> Document {
        document_repo::create(
            conn,
            "proj-1",
            &CreateDocumentRequest {
                parent_id: parent_id.map(str::to_string),
                node_type: node_type.into(),
                title: title.into(),
                synopsis: None,
                status: None,
                sort_order: Some(sort_order),
            },
        )
        .unwrap()
    }

    #[test]
    fn flattens_tree_in_sidebar_order_skipping_folder_content() {
        let conn = test_conn();
        crate::db::project_repo::create(&conn, "proj-1", "P").unwrap();

        let folder = create(&conn, None, "folder", "Part One", 0);
        let doc_a = create(&conn, Some(&folder.id), "document", "Chapter One", 0);
        let nested_folder = create(&conn, Some(&folder.id), "folder", "Interlude", 1);
        let doc_b = create(&conn, Some(&nested_folder.id), "document", "Chapter Two", 0);
        let doc_c = create(&conn, None, "document", "Chapter Three", 1);

        let flattened = flatten_book(&conn, "proj-1").unwrap();
        let ids: Vec<&str> = flattened.iter().map(|d| d.id.as_str()).collect();

        assert_eq!(
            ids,
            vec![doc_a.id.as_str(), doc_b.id.as_str(), doc_c.id.as_str()]
        );
    }

    #[test]
    fn excludes_node_and_its_subtree_when_not_included() {
        let conn = test_conn();
        crate::db::project_repo::create(&conn, "proj-1", "P").unwrap();

        let excluded_folder = create(&conn, None, "folder", "Deleted scenes", 0);
        let hidden_child = create(&conn, Some(&excluded_folder.id), "document", "Cut scene", 0);
        let kept = create(&conn, None, "document", "Chapter One", 1);

        document_repo::update(
            &conn,
            &excluded_folder.id,
            &UpdateDocumentRequest {
                title: None,
                synopsis: None,
                status: None,
                sort_order: None,
                is_included: Some(false),
                parent_id: None,
            },
        )
        .unwrap();

        let flattened = flatten_book(&conn, "proj-1").unwrap();
        let ids: Vec<&str> = flattened.iter().map(|d| d.id.as_str()).collect();

        assert_eq!(ids, vec![kept.id.as_str()]);
        assert!(!ids.contains(&hidden_child.id.as_str()));
    }
}

use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::relation::{CreateRelationRequest, Relation};

fn row_to_relation(row: &rusqlite::Row) -> rusqlite::Result<Relation> {
    Ok(Relation {
        id: row.get(0)?,
        project_id: row.get(1)?,
        source_entity_id: row.get(2)?,
        relation_type_id: row.get(3)?,
        target_entity_id: row.get(4)?,
        notes: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        deleted_at: row.get(8)?,
    })
}

/// Validate that an entity exists and belongs to the project.
fn require_entity(conn: &Connection, entity_id: &str, project_id: &str) -> Result<String> {
    conn.query_row(
        "SELECT entity_type_id FROM entities
         WHERE id=?1 AND project_id=?2 AND deleted_at IS NULL",
        params![entity_id, project_id],
        |row| row.get::<_, String>(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => InkwellError::Validation(format!(
            "Entity '{entity_id}' does not exist in this project"
        )),
        other => InkwellError::Database(other),
    })
}

/// Check if a JSON array of allowed type ULIDs contains the given type_id.
/// Returns true if allowed_types is NULL (no restriction).
fn type_allowed(allowed_types_json: Option<&str>, type_id: &str) -> bool {
    match allowed_types_json {
        None => true,
        Some(json) => {
            serde_json::from_str::<Vec<String>>(json)
                .map(|v| v.iter().any(|id| id == type_id))
                .unwrap_or(true) // if JSON is malformed, don't block
        }
    }
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateRelationRequest,
) -> Result<Relation> {
    // Verify source entity
    let source_type = require_entity(conn, &req.source_entity_id, project_id)?;
    // Verify target entity
    let target_type = require_entity(conn, &req.target_entity_id, project_id)?;

    // Fetch relation type and validate it exists
    let (allowed_src, allowed_tgt): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT allowed_source_types,allowed_target_types
             FROM relation_types WHERE id=?1 AND project_id=?2 AND deleted_at IS NULL",
            params![req.relation_type_id, project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => InkwellError::Validation(format!(
                "RelationType '{}' does not exist in this project",
                req.relation_type_id
            )),
            other => InkwellError::Database(other),
        })?;

    // Validate allowed source/target types
    if !type_allowed(allowed_src.as_deref(), &source_type) {
        return Err(InkwellError::Validation(format!(
            "Source entity type '{source_type}' is not allowed for this relation type"
        )));
    }
    if !type_allowed(allowed_tgt.as_deref(), &target_type) {
        return Err(InkwellError::Validation(format!(
            "Target entity type '{target_type}' is not allowed for this relation type"
        )));
    }

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO relations
            (id,project_id,source_entity_id,relation_type_id,target_entity_id,
             notes,sort_order,created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            id, project_id, req.source_entity_id, req.relation_type_id,
            req.target_entity_id, req.notes, sort_order, now
        ],
    )
    .map_err(|e| {
        if let rusqlite::Error::SqliteFailure(ref err, _) = e {
            if err.code == rusqlite::ErrorCode::ConstraintViolation {
                return InkwellError::Conflict(
                    "This relation already exists between these entities".into(),
                );
            }
        }
        InkwellError::Database(e)
    })?;

    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<Relation> {
    conn.query_row(
        "SELECT id,project_id,source_entity_id,relation_type_id,target_entity_id,
                notes,sort_order,created_at,deleted_at
         FROM relations WHERE id=?1",
        params![id],
        row_to_relation,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("Relation '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

/// Outgoing relations: source_entity_id = entity_id.
pub fn list_outgoing(conn: &Connection, entity_id: &str) -> Result<Vec<Relation>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,source_entity_id,relation_type_id,target_entity_id,
                notes,sort_order,created_at,deleted_at
         FROM relations WHERE source_entity_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], row_to_relation)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

/// Incoming relations (backlinks): target_entity_id = entity_id.
pub fn list_incoming(conn: &Connection, entity_id: &str) -> Result<Vec<Relation>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,source_entity_id,relation_type_id,target_entity_id,
                notes,sort_order,created_at,deleted_at
         FROM relations WHERE target_entity_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], row_to_relation)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE relations SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
        conn
    }

    struct Fixture {
        pid: String,
        etid: String,
        e1: String,
        e2: String,
        rtid: String,
    }

    fn setup(conn: &Connection) -> Fixture {
        let pid = "01P".to_string();
        let etid = "01ET".to_string();
        let e1 = "01E1".to_string();
        let e2 = "01E2".to_string();
        let rtid = "01RT".to_string();

        conn.execute("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')", params![pid]).unwrap();
        conn.execute("INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at) VALUES(?1,?2,'T',0,0,'2026-01-01','2026-01-01')", params![etid, pid]).unwrap();
        conn.execute("INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at) VALUES(?1,?2,?3,'Kael','private',0,'2026-01-01','2026-01-01')", params![e1, pid, etid]).unwrap();
        conn.execute("INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at) VALUES(?1,?2,?3,'Valthera','private',0,'2026-01-01','2026-01-01')", params![e2, pid, etid]).unwrap();
        conn.execute("INSERT INTO relation_types(id,project_id,name,label,is_system,created_at) VALUES(?1,?2,'vive_en','Vive en',0,'2026-01-01')", params![rtid, pid]).unwrap();

        Fixture { pid, etid, e1, e2, rtid }
    }

    #[test]
    fn create_and_get_relation() {
        let conn = test_conn();
        let f = setup(&conn);
        let r = create(&conn, &f.pid, &CreateRelationRequest {
            source_entity_id: f.e1.clone(),
            relation_type_id: f.rtid.clone(),
            target_entity_id: f.e2.clone(),
            notes: None, sort_order: None,
        }).unwrap();
        assert_eq!(r.source_entity_id, f.e1);
        assert_eq!(r.target_entity_id, f.e2);
    }

    #[test]
    fn duplicate_relation_rejected() {
        let conn = test_conn();
        let f = setup(&conn);
        let req = || CreateRelationRequest {
            source_entity_id: f.e1.clone(),
            relation_type_id: f.rtid.clone(),
            target_entity_id: f.e2.clone(),
            notes: None, sort_order: None,
        };
        create(&conn, &f.pid, &req()).unwrap();
        let result = create(&conn, &f.pid, &req());
        assert!(matches!(result, Err(InkwellError::Conflict(_))));
    }

    #[test]
    fn nonexistent_source_rejected() {
        let conn = test_conn();
        let f = setup(&conn);
        let result = create(&conn, &f.pid, &CreateRelationRequest {
            source_entity_id: "bad".into(),
            relation_type_id: f.rtid.clone(),
            target_entity_id: f.e2.clone(),
            notes: None, sort_order: None,
        });
        assert!(matches!(result, Err(InkwellError::Validation(_))));
    }

    #[test]
    fn allowed_source_type_enforced() {
        let conn = test_conn();
        let f = setup(&conn);
        // Set allowed_source_types to a DIFFERENT type id
        conn.execute(
            "UPDATE relation_types SET allowed_source_types='{\"wrong-type\"}' WHERE id=?1",
            params![f.rtid],
        ).unwrap();
        // The JSON above is intentionally set to a JSON array with f.etid excluded
        // Use proper JSON:
        conn.execute(
            "UPDATE relation_types SET allowed_source_types='[\"other-type-id\"]' WHERE id=?1",
            params![f.rtid],
        ).unwrap();
        let result = create(&conn, &f.pid, &CreateRelationRequest {
            source_entity_id: f.e1.clone(),
            relation_type_id: f.rtid.clone(),
            target_entity_id: f.e2.clone(),
            notes: None, sort_order: None,
        });
        assert!(matches!(result, Err(InkwellError::Validation(_))));
    }

    #[test]
    fn incoming_and_outgoing_queries() {
        let conn = test_conn();
        let f = setup(&conn);
        create(&conn, &f.pid, &CreateRelationRequest {
            source_entity_id: f.e1.clone(),
            relation_type_id: f.rtid.clone(),
            target_entity_id: f.e2.clone(),
            notes: None, sort_order: None,
        }).unwrap();

        let outgoing = list_outgoing(&conn, &f.e1).unwrap();
        assert_eq!(outgoing.len(), 1);
        assert_eq!(outgoing[0].target_entity_id, f.e2);

        let incoming = list_incoming(&conn, &f.e2).unwrap();
        assert_eq!(incoming.len(), 1);
        assert_eq!(incoming[0].source_entity_id, f.e1);
    }

    #[test]
    fn soft_delete_relation() {
        let conn = test_conn();
        let f = setup(&conn);
        let r = create(&conn, &f.pid, &CreateRelationRequest {
            source_entity_id: f.e1.clone(),
            relation_type_id: f.rtid.clone(),
            target_entity_id: f.e2.clone(),
            notes: None, sort_order: None,
        }).unwrap();
        delete(&conn, &r.id).unwrap();
        assert!(list_outgoing(&conn, &f.e1).unwrap().is_empty());
    }
}

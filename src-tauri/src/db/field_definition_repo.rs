use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::field_definition::{
    CreateFieldDefinitionRequest, FieldDefinition, UpdateFieldDefinitionRequest, VALID_FIELD_TYPES,
};

fn row_to_fd(row: &rusqlite::Row) -> rusqlite::Result<FieldDefinition> {
    Ok(FieldDefinition {
        id: row.get(0)?,
        entity_type_id: row.get(1)?,
        name: row.get(2)?,
        label: row.get(3)?,
        field_type: row.get(4)?,
        options: row.get(5)?,
        default_value: row.get(6)?,
        is_required: row.get::<_, i64>(7)? != 0,
        visibility: row.get(8)?,
        sort_order: row.get(9)?,
        created_at: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

pub fn create(conn: &Connection, req: &CreateFieldDefinitionRequest) -> Result<FieldDefinition> {
    // Validate field_type before hitting the DB
    if !VALID_FIELD_TYPES.contains(&req.field_type.as_str()) {
        return Err(InkwellError::Validation(format!(
            "Invalid field_type '{}'. Valid types: {}",
            req.field_type,
            VALID_FIELD_TYPES.join(", ")
        )));
    }

    let visibility = req.visibility.as_deref().unwrap_or("private");
    if !matches!(visibility, "private" | "beta" | "public") {
        return Err(InkwellError::Validation(format!(
            "Invalid visibility '{visibility}'. Must be 'private', 'beta', or 'public'"
        )));
    }

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);
    let is_required = req.is_required.unwrap_or(false) as i64;

    conn.execute(
        "INSERT INTO field_definitions
            (id, entity_type_id, name, label, field_type, options, default_value,
             is_required, visibility, sort_order, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            id,
            req.entity_type_id,
            req.name,
            req.label,
            req.field_type,
            req.options,
            req.default_value,
            is_required,
            visibility,
            sort_order,
            now
        ],
    )
    .map_err(|e| {
        // Map SQLite UNIQUE violation to a domain Conflict error
        if let rusqlite::Error::SqliteFailure(ref err, _) = e {
            if err.code == rusqlite::ErrorCode::ConstraintViolation {
                return InkwellError::Conflict(format!(
                    "An active field named '{}' already exists on this entity type",
                    req.name
                ));
            }
        }
        InkwellError::Database(e)
    })?;

    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<FieldDefinition> {
    conn.query_row(
        "SELECT id,entity_type_id,name,label,field_type,options,default_value,
                is_required,visibility,sort_order,created_at,deleted_at
         FROM field_definitions WHERE id=?1",
        params![id],
        row_to_fd,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("FieldDefinition '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

pub fn list(conn: &Connection, entity_type_id: &str) -> Result<Vec<FieldDefinition>> {
    let mut stmt = conn.prepare(
        "SELECT id,entity_type_id,name,label,field_type,options,default_value,
                is_required,visibility,sort_order,created_at,deleted_at
         FROM field_definitions
         WHERE entity_type_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, label ASC",
    )?;
    let rows = stmt.query_map(params![entity_type_id], row_to_fd)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn update(
    conn: &Connection,
    id: &str,
    req: &UpdateFieldDefinitionRequest,
) -> Result<FieldDefinition> {
    let now = chrono::Utc::now().to_rfc3339();
    let current = get(conn, id)?;

    if let Some(ref v) = req.visibility {
        if !matches!(v.as_str(), "private" | "beta" | "public") {
            return Err(InkwellError::Validation(format!(
                "Invalid visibility '{v}'"
            )));
        }
    }

    let label = req.label.as_deref().unwrap_or(&current.label);
    let options = req.options.as_deref().or(current.options.as_deref());
    let default_value = req
        .default_value
        .as_deref()
        .or(current.default_value.as_deref());
    let is_required = req.is_required.unwrap_or(current.is_required) as i64;
    let visibility = req.visibility.as_deref().unwrap_or(&current.visibility);
    let sort_order = req.sort_order.unwrap_or(current.sort_order);

    conn.execute(
        "UPDATE field_definitions
         SET label=?1,options=?2,default_value=?3,is_required=?4,
             visibility=?5,sort_order=?6,created_at=created_at
         WHERE id=?7 AND deleted_at IS NULL",
        params![
            label,
            options,
            default_value,
            is_required,
            visibility,
            sort_order,
            id
        ],
    )?;
    // Update updated_at — field_definitions has no updated_at column per schema,
    // so we just re-fetch.
    let _ = now; // kept for symmetry with other repos
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id)?; // ensures it exists
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE field_definitions SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
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

    fn seed(conn: &Connection) -> (String, String) {
        let pid = "01PROJ000000000000000000001".to_string();
        let etid = "01ETYPE00000000000000000001".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Personaje',0,0,'2026-01-01','2026-01-01')",
            params![etid, pid],
        ).unwrap();
        (pid, etid)
    }

    fn make_req(etid: &str, name: &str) -> CreateFieldDefinitionRequest {
        CreateFieldDefinitionRequest {
            entity_type_id: etid.into(),
            name: name.into(),
            label: name.into(),
            field_type: "text".into(),
            options: None,
            default_value: None,
            is_required: None,
            visibility: None,
            sort_order: None,
        }
    }

    #[test]
    fn create_field_definition() {
        let conn = test_conn();
        let (_, etid) = seed(&conn);
        let fd = create(&conn, &make_req(&etid, "edad")).unwrap();
        assert_eq!(fd.name, "edad");
        assert_eq!(fd.visibility, "private");
    }

    #[test]
    fn duplicate_active_name_rejected() {
        let conn = test_conn();
        let (_, etid) = seed(&conn);
        create(&conn, &make_req(&etid, "edad")).unwrap();
        let result = create(&conn, &make_req(&etid, "edad"));
        assert!(matches!(result, Err(InkwellError::Conflict(_))));
    }

    #[test]
    fn name_reuse_after_soft_delete() {
        let conn = test_conn();
        let (_, etid) = seed(&conn);
        let fd = create(&conn, &make_req(&etid, "edad")).unwrap();
        delete(&conn, &fd.id).unwrap();
        // After soft-delete, the same name can be reused
        let fd2 = create(&conn, &make_req(&etid, "edad")).unwrap();
        assert_eq!(fd2.name, "edad");
        assert_ne!(fd.id, fd2.id);
    }

    #[test]
    fn invalid_field_type_rejected() {
        let conn = test_conn();
        let (_, etid) = seed(&conn);
        let mut req = make_req(&etid, "x");
        req.field_type = "wizard".into();
        let result = create(&conn, &req);
        assert!(matches!(result, Err(InkwellError::Validation(_))));
    }

    #[test]
    fn list_returns_active_only() {
        let conn = test_conn();
        let (_, etid) = seed(&conn);
        let fd = create(&conn, &make_req(&etid, "nombre")).unwrap();
        create(&conn, &make_req(&etid, "edad")).unwrap();
        delete(&conn, &fd.id).unwrap();
        let list = list(&conn, &etid).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "edad");
    }
}

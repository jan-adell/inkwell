use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::field_value::{FieldValue, FieldValueInput, SetFieldValueRequest};

fn row_to_fv(row: &rusqlite::Row) -> rusqlite::Result<FieldValue> {
    Ok(FieldValue {
        id: row.get(0)?,
        entity_id: row.get(1)?,
        field_def_id: row.get(2)?,
        value_text: row.get(3)?,
        value_number: row.get(4)?,
        value_boolean: row.get::<_, Option<i64>>(5)?.map(|v| v != 0),
        value_date: row.get(6)?,
        value_json: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

/// Validate that the supplied value variant matches the field's declared type.
fn validate_value_for_type(field_type: &str, value: &FieldValueInput) -> Result<()> {
    let ok = match (field_type, value) {
        (
            "text" | "textarea" | "select" | "url" | "color" | "entity_ref",
            FieldValueInput::Text(_),
        ) => true,
        ("number", FieldValueInput::Number(_)) => true,
        ("boolean", FieldValueInput::Boolean(_)) => true,
        ("date", FieldValueInput::Date(d)) => {
            // Basic ISO 8601 sanity: must contain at least one '-'
            d.contains('-')
        }
        ("multiselect", FieldValueInput::Json(j)) => {
            // Must be valid JSON
            serde_json::from_str::<serde_json::Value>(j).is_ok()
        }
        _ => false,
    };
    if ok {
        Ok(())
    } else {
        Err(InkwellError::Validation(format!(
            "Value type mismatch: field_type '{field_type}' is not compatible with the supplied value variant"
        )))
    }
}

/// Upsert: insert if the (entity_id, field_def_id) pair doesn't exist, otherwise update.
pub fn set(conn: &Connection, req: &SetFieldValueRequest) -> Result<FieldValue> {
    // Look up the field definition to validate type compatibility
    let field_type: String = conn
        .query_row(
            "SELECT field_type FROM field_definitions WHERE id=?1 AND deleted_at IS NULL",
            params![req.field_def_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                InkwellError::NotFound(format!("FieldDefinition '{}' not found", req.field_def_id))
            }
            other => InkwellError::Database(other),
        })?;

    validate_value_for_type(&field_type, &req.value)?;

    let now = chrono::Utc::now().to_rfc3339();

    // Unpack value into the right column
    #[allow(clippy::type_complexity)]
    let (vtext, vnumber, vboolean, vdate, vjson): (
        Option<&str>,
        Option<f64>,
        Option<i64>,
        Option<&str>,
        Option<&str>,
    ) = match &req.value {
        FieldValueInput::Text(s) => (Some(s.as_str()), None, None, None, None),
        FieldValueInput::Number(n) => (None, Some(*n), None, None, None),
        FieldValueInput::Boolean(b) => (None, None, Some(*b as i64), None, None),
        FieldValueInput::Date(d) => (None, None, None, Some(d.as_str()), None),
        FieldValueInput::Json(j) => (None, None, None, None, Some(j.as_str())),
    };

    // Check if a row already exists for this (entity_id, field_def_id)
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM field_values WHERE entity_id=?1 AND field_def_id=?2",
            params![req.entity_id, req.field_def_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(ref id) = existing_id {
        conn.execute(
            "UPDATE field_values
             SET value_text=?1,value_number=?2,value_boolean=?3,
                 value_date=?4,value_json=?5,updated_at=?6
             WHERE id=?7",
            params![vtext, vnumber, vboolean, vdate, vjson, now, id],
        )?;
        get_by_id(conn, id)
    } else {
        let id = ulid::Ulid::new().to_string();
        conn.execute(
            "INSERT INTO field_values
                (id,entity_id,field_def_id,value_text,value_number,
                 value_boolean,value_date,value_json,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                id,
                req.entity_id,
                req.field_def_id,
                vtext,
                vnumber,
                vboolean,
                vdate,
                vjson,
                now
            ],
        )?;
        get_by_id(conn, &id)
    }
}

fn get_by_id(conn: &Connection, id: &str) -> Result<FieldValue> {
    conn.query_row(
        "SELECT id,entity_id,field_def_id,value_text,value_number,
                value_boolean,value_date,value_json,updated_at
         FROM field_values WHERE id=?1",
        params![id],
        row_to_fv,
    )
    .map_err(InkwellError::Database)
}

pub fn get_for_entity(conn: &Connection, entity_id: &str) -> Result<Vec<FieldValue>> {
    let mut stmt = conn.prepare(
        "SELECT id,entity_id,field_def_id,value_text,value_number,
                value_boolean,value_date,value_json,updated_at
         FROM field_values WHERE entity_id=?1",
    )?;
    let rows = stmt.query_map(params![entity_id], row_to_fv)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn delete(conn: &Connection, entity_id: &str, field_def_id: &str) -> Result<()> {
    let n = conn.execute(
        "DELETE FROM field_values WHERE entity_id=?1 AND field_def_id=?2",
        params![entity_id, field_def_id],
    )?;
    if n == 0 {
        return Err(InkwellError::NotFound(format!(
            "No field value for entity '{entity_id}' and field '{field_def_id}'"
        )));
    }
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

    fn seed(conn: &Connection) -> (String, String, String) {
        let pid = "01P".to_string();
        let etid = "01ET".to_string();
        let eid = "01E".to_string();
        conn.execute("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')", params![pid]).unwrap();
        conn.execute("INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at) VALUES(?1,?2,'T',0,0,'2026-01-01','2026-01-01')", params![etid, pid]).unwrap();
        conn.execute("INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at) VALUES(?1,?2,?3,'E','private',0,'2026-01-01','2026-01-01')", params![eid, pid, etid]).unwrap();
        (pid, etid, eid)
    }

    fn seed_field(conn: &Connection, etid: &str, name: &str, ft: &str) -> String {
        let fid = format!("01FD_{name}");
        conn.execute(
            "INSERT INTO field_definitions(id,entity_type_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES(?1,?2,?3,?3,?4,0,'private',0,'2026-01-01')",
            params![fid, etid, name, ft],
        ).unwrap();
        fid
    }

    #[test]
    fn insert_text_value() {
        let conn = test_conn();
        let (_, etid, eid) = seed(&conn);
        let fid = seed_field(&conn, &etid, "nombre", "text");
        let fv = set(
            &conn,
            &SetFieldValueRequest {
                entity_id: eid.clone(),
                field_def_id: fid.clone(),
                value: FieldValueInput::Text("Kael".into()),
            },
        )
        .unwrap();
        assert_eq!(fv.value_text.as_deref(), Some("Kael"));
    }

    #[test]
    fn upsert_updates_existing() {
        let conn = test_conn();
        let (_, etid, eid) = seed(&conn);
        let fid = seed_field(&conn, &etid, "edad", "number");
        set(
            &conn,
            &SetFieldValueRequest {
                entity_id: eid.clone(),
                field_def_id: fid.clone(),
                value: FieldValueInput::Number(25.0),
            },
        )
        .unwrap();
        let fv = set(
            &conn,
            &SetFieldValueRequest {
                entity_id: eid.clone(),
                field_def_id: fid.clone(),
                value: FieldValueInput::Number(30.0),
            },
        )
        .unwrap();
        assert_eq!(fv.value_number, Some(30.0));
        // Only one row
        assert_eq!(get_for_entity(&conn, &eid).unwrap().len(), 1);
    }

    #[test]
    fn type_mismatch_rejected() {
        let conn = test_conn();
        let (_, etid, eid) = seed(&conn);
        let fid = seed_field(&conn, &etid, "edad", "number");
        let result = set(
            &conn,
            &SetFieldValueRequest {
                entity_id: eid.clone(),
                field_def_id: fid,
                value: FieldValueInput::Text("veintisiete".into()),
            },
        );
        assert!(matches!(result, Err(InkwellError::Validation(_))));
    }

    #[test]
    fn get_for_entity_and_delete() {
        let conn = test_conn();
        let (_, etid, eid) = seed(&conn);
        let fid = seed_field(&conn, &etid, "bio", "textarea");
        set(
            &conn,
            &SetFieldValueRequest {
                entity_id: eid.clone(),
                field_def_id: fid.clone(),
                value: FieldValueInput::Text("Un guerrero".into()),
            },
        )
        .unwrap();
        assert_eq!(get_for_entity(&conn, &eid).unwrap().len(), 1);
        delete(&conn, &eid, &fid).unwrap();
        assert_eq!(get_for_entity(&conn, &eid).unwrap().len(), 0);
    }

    #[test]
    fn json_validated_for_multiselect() {
        let conn = test_conn();
        let (_, etid, eid) = seed(&conn);
        let fid = seed_field(&conn, &etid, "tags", "multiselect");
        // Valid JSON array
        set(
            &conn,
            &SetFieldValueRequest {
                entity_id: eid.clone(),
                field_def_id: fid.clone(),
                value: FieldValueInput::Json(r#"["guerrero","explorador"]"#.into()),
            },
        )
        .unwrap();
        // Invalid JSON
        let bad = set(
            &conn,
            &SetFieldValueRequest {
                entity_id: eid.clone(),
                field_def_id: fid.clone(),
                value: FieldValueInput::Json("not json".into()),
            },
        );
        assert!(matches!(bad, Err(InkwellError::Validation(_))));
    }
}

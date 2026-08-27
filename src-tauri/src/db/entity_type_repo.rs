use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::entity_type::{CreateEntityTypeRequest, EntityType, UpdateEntityTypeRequest};

fn row_to_entity_type(row: &rusqlite::Row) -> rusqlite::Result<EntityType> {
    Ok(EntityType {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        name_plural: row.get(3)?,
        icon: row.get(4)?,
        color: row.get(5)?,
        description: row.get(6)?,
        is_system: row.get::<_, i64>(7)? != 0,
        sort_order: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateEntityTypeRequest,
) -> Result<EntityType> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO entity_types
            (id, project_id, name, name_plural, icon, color, description,
             is_system, sort_order, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,?9,?9)",
        params![
            id,
            project_id,
            req.name,
            req.name_plural,
            req.icon,
            req.color,
            req.description,
            sort_order,
            now
        ],
    )?;

    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<EntityType> {
    conn.query_row(
        "SELECT id,project_id,name,name_plural,icon,color,description,
                is_system,sort_order,created_at,updated_at,deleted_at
         FROM entity_types WHERE id=?1",
        params![id],
        row_to_entity_type,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("EntityType '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

pub fn list(conn: &Connection, project_id: &str) -> Result<Vec<EntityType>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,name,name_plural,icon,color,description,
                is_system,sort_order,created_at,updated_at,deleted_at
         FROM entity_types
         WHERE project_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC",
    )?;

    let rows = stmt.query_map(params![project_id], row_to_entity_type)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn update(conn: &Connection, id: &str, req: &UpdateEntityTypeRequest) -> Result<EntityType> {
    let now = chrono::Utc::now().to_rfc3339();

    // Fetch current to apply partial update
    let current = get(conn, id)?;

    let name = req.name.as_deref().unwrap_or(&current.name);
    let name_plural = req
        .name_plural
        .as_deref()
        .or(current.name_plural.as_deref());
    let icon = req.icon.as_deref().or(current.icon.as_deref());
    let color = req.color.as_deref().or(current.color.as_deref());
    let description = req
        .description
        .as_deref()
        .or(current.description.as_deref());
    let sort_order = req.sort_order.unwrap_or(current.sort_order);

    conn.execute(
        "UPDATE entity_types
         SET name=?1, name_plural=?2, icon=?3, color=?4, description=?5,
             sort_order=?6, updated_at=?7
         WHERE id=?8 AND deleted_at IS NULL",
        params![
            name,
            name_plural,
            icon,
            color,
            description,
            sort_order,
            now,
            id
        ],
    )?;

    get(conn, id)
}

/// Soft-delete. Refuses to delete system types.
pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    let current = get(conn, id)?;

    if current.is_system {
        return Err(InkwellError::Forbidden(format!(
            "EntityType '{id}' is a system type and cannot be deleted"
        )));
    }

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE entity_types SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
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

    fn seed_project(conn: &Connection) -> String {
        let pid = "01TEST_PROJECT_000000000001".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'Test','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();
        pid
    }

    #[test]
    fn create_and_get() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let req = CreateEntityTypeRequest {
            name: "Personaje".into(),
            name_plural: Some("Personajes".into()),
            icon: None,
            color: None,
            description: None,
            sort_order: None,
        };
        let et = create(&conn, &pid, &req).unwrap();
        assert_eq!(et.name, "Personaje");
        assert!(!et.is_system);

        let fetched = get(&conn, &et.id).unwrap();
        assert_eq!(fetched.id, et.id);
    }

    #[test]
    fn list_returns_active_only() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let req = |name: &str| CreateEntityTypeRequest {
            name: name.into(),
            name_plural: None,
            icon: None,
            color: None,
            description: None,
            sort_order: None,
        };
        create(&conn, &pid, &req("Lugar")).unwrap();
        let et2 = create(&conn, &pid, &req("Objeto")).unwrap();
        delete(&conn, &et2.id).unwrap();

        let list = list(&conn, &pid).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Lugar");
    }

    #[test]
    fn update_partial() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let et = create(
            &conn,
            &pid,
            &CreateEntityTypeRequest {
                name: "Criatura".into(),
                name_plural: None,
                icon: None,
                color: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();

        let updated = update(
            &conn,
            &et.id,
            &UpdateEntityTypeRequest {
                name: Some("Monstruo".into()),
                name_plural: None,
                icon: None,
                color: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Monstruo");
    }

    #[test]
    fn soft_delete() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let et = create(
            &conn,
            &pid,
            &CreateEntityTypeRequest {
                name: "Facción".into(),
                name_plural: None,
                icon: None,
                color: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();
        delete(&conn, &et.id).unwrap();

        let fetched = get(&conn, &et.id).unwrap();
        assert!(fetched.deleted_at.is_some());
    }

    #[test]
    fn cannot_delete_system_type() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        // Insert a system type directly
        let sid = "01SYSTEM_TYPE_000000000001".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'System',1,0,'2026-01-01','2026-01-01')",
            params![sid, pid],
        ).unwrap();

        let result = delete(&conn, &sid);
        assert!(matches!(result, Err(InkwellError::Forbidden(_))));
    }
}

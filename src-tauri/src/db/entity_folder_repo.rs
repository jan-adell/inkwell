use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::entity_folder::{
    CreateEntityFolderRequest, EntityFolder, UpdateEntityFolderRequest,
};

fn row_to_folder(row: &rusqlite::Row) -> rusqlite::Result<EntityFolder> {
    Ok(EntityFolder {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        deleted_at: row.get(5)?,
    })
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateEntityFolderRequest,
) -> Result<EntityFolder> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO entity_folders (id, project_id, name, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, project_id, req.name, sort_order, now],
    )?;

    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<EntityFolder> {
    conn.query_row(
        "SELECT id, project_id, name, sort_order, created_at, deleted_at
         FROM entity_folders WHERE id=?1",
        params![id],
        row_to_folder,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("EntityFolder '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

pub fn list(conn: &Connection, project_id: &str) -> Result<Vec<EntityFolder>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, sort_order, created_at, deleted_at
         FROM entity_folders
         WHERE project_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_folder)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn update(
    conn: &Connection,
    id: &str,
    req: &UpdateEntityFolderRequest,
) -> Result<EntityFolder> {
    let current = get(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();

    let name = req.name.as_deref().unwrap_or(&current.name);
    let sort_order = req.sort_order.unwrap_or(current.sort_order);

    conn.execute(
        "UPDATE entity_folders SET name=?1, sort_order=?2, created_at=created_at
         WHERE id=?3 AND deleted_at IS NULL",
        params![name, sort_order, id],
    )?;
    let _ = now;

    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE entity_folders SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
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
        let folder = create(
            &conn,
            &pid,
            &CreateEntityFolderRequest {
                name: "Fellowship".into(),
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(folder.name, "Fellowship");
        assert_eq!(folder.sort_order, 0);
        assert_eq!(get(&conn, &folder.id).unwrap().id, folder.id);
    }

    #[test]
    fn list_active_only() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let f1 = create(
            &conn,
            &pid,
            &CreateEntityFolderRequest {
                name: "Villains".into(),
                sort_order: None,
            },
        )
        .unwrap();
        let f2 = create(
            &conn,
            &pid,
            &CreateEntityFolderRequest {
                name: "Heroes".into(),
                sort_order: None,
            },
        )
        .unwrap();
        delete(&conn, &f2.id).unwrap();

        let folders = list(&conn, &pid).unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].id, f1.id);
    }

    #[test]
    fn update_name() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let f = create(
            &conn,
            &pid,
            &CreateEntityFolderRequest {
                name: "Draft".into(),
                sort_order: None,
            },
        )
        .unwrap();
        let updated = update(
            &conn,
            &f.id,
            &UpdateEntityFolderRequest {
                name: Some("Final".into()),
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Final");
    }

    #[test]
    fn soft_delete() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let f = create(
            &conn,
            &pid,
            &CreateEntityFolderRequest {
                name: "Temp".into(),
                sort_order: None,
            },
        )
        .unwrap();
        delete(&conn, &f.id).unwrap();
        assert!(get(&conn, &f.id).unwrap().deleted_at.is_some());
    }
}

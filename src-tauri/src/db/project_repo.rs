#![allow(dead_code)]

use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};

/// Minimal project row — mirrors the `projects` table.
/// ProjectMeta (meta.json) is a separate struct in models/project.rs.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub settings: Option<String>, // JSON
}

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<ProjectRow> {
    Ok(ProjectRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        settings: row.get(5)?,
    })
}

pub fn create(conn: &Connection, id: &str, name: &str) -> Result<ProjectRow> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,?2,?3,?3)",
        params![id, name, now],
    )?;
    get(conn, id)
}

pub fn get(conn: &Connection, id: &str) -> Result<ProjectRow> {
    conn.query_row(
        "SELECT id,name,description,created_at,updated_at,settings
         FROM projects WHERE id=?1",
        params![id],
        row_to_project,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("Project '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

pub fn list(conn: &Connection) -> Result<Vec<ProjectRow>> {
    let mut stmt = conn.prepare(
        "SELECT id,name,description,created_at,updated_at,settings
         FROM projects ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], row_to_project)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn update_name(conn: &Connection, id: &str, name: &str) -> Result<ProjectRow> {
    get(conn, id)?; // ensure exists
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET name=?1,updated_at=?2 WHERE id=?3",
        params![name, now, id],
    )?;
    get(conn, id)
}

pub fn update_settings(conn: &Connection, id: &str, settings_json: &str) -> Result<ProjectRow> {
    get(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET settings=?1,updated_at=?2 WHERE id=?3",
        params![settings_json, now, id],
    )?;
    get(conn, id)
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

    #[test]
    fn create_and_get() {
        let conn = test_conn();
        let p = create(&conn, "01PID0000000000000000000001", "Aetheria").unwrap();
        assert_eq!(p.name, "Aetheria");
        assert_eq!(get(&conn, &p.id).unwrap().id, p.id);
    }

    #[test]
    fn list_projects() {
        let conn = test_conn();
        create(&conn, "01A", "Alpha").unwrap();
        create(&conn, "01B", "Beta").unwrap();
        assert_eq!(list(&conn).unwrap().len(), 2);
    }

    #[test]
    fn update_name() {
        let conn = test_conn();
        create(&conn, "01P", "Old").unwrap();
        let p = super::update_name(&conn, "01P", "New").unwrap();
        assert_eq!(p.name, "New");
    }

    #[test]
    fn get_not_found() {
        let conn = test_conn();
        let result = get(&conn, "nonexistent");
        assert!(matches!(result, Err(InkwellError::NotFound(_))));
    }
}

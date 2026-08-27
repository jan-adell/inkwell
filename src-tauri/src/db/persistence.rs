use rusqlite::Connection;

use crate::error::Result;
use crate::db::project_repo::ProjectRow;

/// Persistence traits and lightweight SQLite adapters.
///
/// SOLID note: define small focused interfaces (single responsibility) for each
/// repository we need. Adapters implement these traits and delegate to concrete
/// DB functions. This keeps services decoupled from rusqlite and allows easy
/// substitution for tests or other storage backends.

/// ProjectRepository — interface for basic project CRUD used by the core.
pub trait ProjectRepository {
    fn create(conn: &Connection, id: &str, name: &str) -> Result<ProjectRow>;
    fn get(conn: &Connection, id: &str) -> Result<ProjectRow>;
}

/// SqliteProjectRepository — SQLite-backed adapter using existing project_repo
pub struct SqliteProjectRepository;

impl ProjectRepository for SqliteProjectRepository {
    fn create(conn: &Connection, id: &str, name: &str) -> Result<ProjectRow> {
        crate::db::project_repo::create(conn, id, name)
    }

    fn get(conn: &Connection, id: &str) -> Result<ProjectRow> {
        crate::db::project_repo::get(conn, id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
        conn
    }

    #[test]
    fn sqlite_project_repo_create_and_get() {
        let conn = test_conn();
        let p = SqliteProjectRepository::create(&conn, "proj-1", "Test Project").unwrap();
        assert_eq!(p.name, "Test Project");
        let got = SqliteProjectRepository::get(&conn, &p.id).unwrap();
        assert_eq!(got.id, p.id);
    }
}

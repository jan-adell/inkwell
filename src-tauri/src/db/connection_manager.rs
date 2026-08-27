use std::path::Path;
use rusqlite::Connection;

use crate::error::Result;
use crate::db::PragmaStatus;

/// ConnectionManager — small facade around `open_database` and pragma verification.
///
/// Purpose: provide a single, testable place to open and verify SQLite connections.
/// This keeps the higher-level initialization code (commands/core.rs) simple and
/// allows the rest of the code to depend on an abstraction if needed later.
pub struct ConnectionManager;

impl ConnectionManager {
    /// Open (or create) a database at `db_path` and return the rusqlite::Connection.
    pub fn open(db_path: &Path) -> Result<Connection> {
        // Delegate to the existing open_database function in crate::db
        crate::db::open_database(db_path)
    }

    /// Verify the critical pragmas are set on the given connection.
    pub fn verify(conn: &Connection) -> Result<PragmaStatus> {
        crate::db::verify_pragmas(conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};

    #[test]
    fn open_and_verify_file_db() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let conn = ConnectionManager::open(&db_path).expect("open database");
        // Ensure migrations run cleanly (similar to initialize_core path)
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&conn).unwrap();

        let status = ConnectionManager::verify(&conn).expect("verify pragmas");
        assert!(status.wal_enabled, "WAL should be enabled");
        assert!(status.foreign_keys_enabled, "Foreign keys should be enabled");
    }
}

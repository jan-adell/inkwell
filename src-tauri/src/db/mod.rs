pub mod document_repo;
pub mod entity_repo;
pub mod entity_type_repo;
pub mod field_definition_repo;
pub mod field_value_repo;
pub mod migrations;
pub mod project_repo;
pub mod relation_repo;
pub mod relation_type_repo;

use rusqlite::{Connection, OpenFlags};
use std::path::Path;

use crate::error::Result;

/// Open (or create) the SQLite database at `db_path`.
///
/// Always applies:
/// - WAL journal mode — better concurrent read performance, safer crash recovery
/// - Foreign key enforcement — referential integrity
/// - Busy timeout — avoids SQLITE_BUSY on concurrent access during future sync
pub fn open_database(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;

    configure_connection(&conn)?;
    Ok(conn)
}

/// Apply per-connection pragmas.
/// These must be set on every new connection before any queries.
fn configure_connection(conn: &Connection) -> Result<()> {
    // WAL mode: safer, better performance for our read-heavy access pattern.
    // Must be set before creating tables on a new database.
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;

    // Enforce foreign key constraints. SQLite disables these by default.
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // 5-second busy timeout before returning SQLITE_BUSY.
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;

    // Synchronous = NORMAL is safe with WAL and much faster than FULL.
    conn.execute_batch("PRAGMA synchronous = NORMAL;")?;

    // Cache size: 64 MB. Reasonable for a writing application.
    conn.execute_batch("PRAGMA cache_size = -65536;")?;

    Ok(())
}

/// Verify that the connection pragmas are applied as expected.
/// Used in tests and during initialization diagnostics.
pub fn verify_pragmas(conn: &Connection) -> Result<PragmaStatus> {
    let journal_mode: String = conn.query_row("PRAGMA journal_mode;", [], |row| row.get(0))?;

    let foreign_keys: i64 = conn.query_row("PRAGMA foreign_keys;", [], |row| row.get(0))?;

    Ok(PragmaStatus {
        wal_enabled: journal_mode.to_lowercase() == "wal",
        foreign_keys_enabled: foreign_keys == 1,
    })
}

/// Status of the critical connection pragmas.
#[derive(Debug, serde::Serialize)]
pub struct PragmaStatus {
    pub wal_enabled: bool,
    pub foreign_keys_enabled: bool,
}

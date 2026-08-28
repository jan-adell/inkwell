pub mod document_repo;
pub mod entity_repo;
pub mod entity_type_repo;
pub mod field_definition_repo;
pub mod field_value_repo;
pub mod migrations;
pub mod project_repo;
pub mod relation_repo;
pub mod relation_type_repo;

pub mod blob_store;
pub mod document_blob;

pub mod connection_manager;
pub mod registry;

use rusqlite::{Connection, OpenFlags};
use std::path::Path;

use crate::error::Result;

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

fn configure_connection(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
    conn.execute_batch("PRAGMA synchronous = NORMAL;")?;
    conn.execute_batch("PRAGMA cache_size = -65536;")?;
    Ok(())
}

pub fn verify_pragmas(conn: &Connection) -> Result<PragmaStatus> {
    let journal_mode: String = conn.query_row("PRAGMA journal_mode;", [], |row| row.get(0))?;
    let foreign_keys: i64 = conn.query_row("PRAGMA foreign_keys;", [], |row| row.get(0))?;
    Ok(PragmaStatus {
        wal_enabled: journal_mode.to_lowercase() == "wal",
        foreign_keys_enabled: foreign_keys == 1,
    })
}

#[derive(Debug, serde::Serialize)]
pub struct PragmaStatus {
    pub wal_enabled: bool,
    pub foreign_keys_enabled: bool,
}

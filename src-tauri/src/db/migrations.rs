use rusqlite::Connection;
use sha2::{Digest, Sha256};

use crate::error::{InkwellError, Result};

/// A single migration: a version number, a name, and the SQL to apply.
pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

/// All migrations in ascending version order.
///
/// Rules:
/// - Versions must be sequential starting at 1.
/// - Never modify an already-shipped migration; add a new one instead.
/// - Prefer additive changes (new columns/tables) over destructive ones.
/// - Each migration is applied inside a transaction; failure = rollback.
///
pub fn all_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        name: "initial_schema",
        sql: include_str!("migrations/001_initial_schema.sql"),
    }]
}

/// Ensure the `schema_migrations` tracking table exists.
/// This is always safe to call; it is idempotent.
pub fn ensure_migrations_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            name        TEXT    NOT NULL,
            applied_at  TEXT    NOT NULL,  -- ISO 8601 datetime
            checksum    TEXT    NOT NULL   -- SHA-256 hex of the migration SQL
        );
        ",
    )?;
    Ok(())
}

/// Return the highest migration version that has been applied,
/// or 0 if no migrations have been applied yet.
pub fn current_version(conn: &Connection) -> Result<u32> {
    let version: u32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations;",
        [],
        |row| row.get(0),
    )?;
    Ok(version)
}

/// Apply all pending migrations in order.
///
/// For each migration whose version > current_version:
/// 1. Begin a transaction.
/// 2. Execute the migration SQL.
/// 3. Insert a record into schema_migrations.
/// 4. Commit.
///
/// If any step fails, the transaction is rolled back and an error is returned.
/// No further migrations are attempted after a failure.
pub fn run_pending_migrations(conn: &mut Connection) -> Result<u32> {
    ensure_migrations_table(conn)?;

    let applied = current_version(conn)?;
    let migrations = all_migrations();

    let mut last_applied = applied;

    for migration in &migrations {
        if migration.version <= applied {
            // Already applied.
            continue;
        }

        // Validate sequential ordering.
        if migration.version != last_applied + 1 {
            return Err(InkwellError::Migration(format!(
                "Migration version gap: expected {}, found {}",
                last_applied + 1,
                migration.version
            )));
        }

        apply_migration(conn, migration)?;
        last_applied = migration.version;
    }

    Ok(last_applied)
}

/// Apply a single migration inside a transaction.
fn apply_migration(conn: &mut Connection, migration: &Migration) -> Result<()> {
    let checksum = sha256_hex(migration.sql);
    let now = chrono::Utc::now().to_rfc3339();

    // Use a savepoint so we can roll back just this migration
    // without affecting any prior work in the connection.
    let tx = conn.transaction()?;

    // Execute the migration SQL. execute_batch handles multiple statements.
    tx.execute_batch(migration.sql).map_err(|e| {
        InkwellError::Migration(format!(
            "Migration {} '{}' failed: {}",
            migration.version, migration.name, e
        ))
    })?;

    // Record that it was applied.
    tx.execute(
        "INSERT INTO schema_migrations (version, name, applied_at, checksum)
         VALUES (?1, ?2, ?3, ?4);",
        rusqlite::params![migration.version, migration.name, now, checksum],
    )
    .map_err(|e| {
        InkwellError::Migration(format!(
            "Failed to record migration {} in schema_migrations: {}",
            migration.version, e
        ))
    })?;

    tx.commit()?;

    Ok(())
}

/// SHA-256 hex digest of a string — used as migration checksum.
fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Open an in-memory SQLite connection for testing.
    /// WAL mode is not available for in-memory databases, so we skip
    /// pragma configuration and test the migration logic directly.
    fn test_conn() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    #[test]
    fn migrations_table_created_idempotently() {
        let conn = test_conn();
        ensure_migrations_table(&conn).unwrap();
        ensure_migrations_table(&conn).unwrap(); // second call must not fail
        let version = current_version(&conn).unwrap();
        assert_eq!(version, 0);
    }

    #[test]
    fn no_migrations_returns_version_zero() {
        let conn = test_conn();
        ensure_migrations_table(&conn).unwrap();
        assert_eq!(current_version(&conn).unwrap(), 0);
    }

    #[test]
    fn run_pending_applies_all_migrations_and_returns_latest_version() {
        let mut conn = test_conn();
        let version = run_pending_migrations(&mut conn).unwrap();
        assert_eq!(version, all_migrations().last().map(|m| m.version).unwrap_or(0));
    }

    #[test]
    fn sha256_hex_is_deterministic() {
        let a = sha256_hex("SELECT 1;");
        let b = sha256_hex("SELECT 1;");
        assert_eq!(a, b);
        assert_ne!(a, sha256_hex("SELECT 2;"));
    }
}

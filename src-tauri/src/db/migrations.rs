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
    vec![
        Migration {
            version: 1,
            name: "initial_schema",
            sql: include_str!("migrations/001_initial_schema.sql"),
        },
        Migration {
            version: 2,
            name: "external_blobs",
            sql: include_str!("migrations/002_external_blobs.sql"),
        },
        Migration {
            version: 3,
            name: "editor_and_assets",
            sql: include_str!("migrations/003_editor_and_assets.sql"),
        },
        Migration {
            version: 4,
            name: "entity_folders",
            sql: include_str!("migrations/004_entity_folders.sql"),
        },
        Migration {
            version: 5,
            name: "relations_unique_active_only",
            sql: include_str!("migrations/005_relations_unique_active_only.sql"),
        },
        Migration {
            version: 6,
            name: "entity_scoped_field_definitions",
            sql: include_str!("migrations/006_entity_scoped_field_definitions.sql"),
        },
    ]
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

    // Disable foreign key constraints for the migration. SQLite ignores PRAGMA
    // foreign_keys once a transaction is open, so we must disable it before
    // beginning the transaction. This is required when migrations rebuild tables
    // that other tables reference by FK (e.g., table-rebuild patterns).
    conn.execute_batch("PRAGMA foreign_keys = OFF;")?;

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

    // Re-enable foreign key constraints after the migration succeeds.
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

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
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn
    }

    fn seed(conn: &Connection) -> (String, String, String) {
        let pid = "p1".to_string();
        let etid = "et1".to_string();
        let eid = "e1".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            [&pid],
        ).unwrap();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Character',0,0,'2026-01-01','2026-01-01')",
            [&etid, &pid],
        ).unwrap();
        conn.execute(
            "INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at)
             VALUES(?1,?2,?3,'Kael','private',0,'2026-01-01','2026-01-01')",
            [&eid, &pid, &etid],
        ).unwrap();
        (pid, etid, eid)
    }

    fn seed_field_def(conn: &Connection, owner_id: &str, owner_type: &str, name: &str) -> String {
        let fd_id = format!("fd-{}", name);
        if owner_type == "type" {
            conn.execute(
                "INSERT INTO field_definitions(id,entity_type_id,name,label,field_type,is_required,visibility,sort_order,created_at)
                 VALUES(?1,?2,?3,?3,'text',0,'private',0,'2026-01-01')",
                [&fd_id, owner_id, name],
            ).unwrap();
        } else {
            conn.execute(
                "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
                 VALUES(?1,?2,?3,?3,'text',0,'private',0,'2026-01-01')",
                [&fd_id, owner_id, name],
            ).unwrap();
        }
        fd_id
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
        assert_eq!(
            version,
            all_migrations().last().map(|m| m.version).unwrap_or(0)
        );
    }

    #[test]
    fn sha256_hex_is_deterministic() {
        let a = sha256_hex("SELECT 1;");
        let b = sha256_hex("SELECT 1;");
        assert_eq!(a, b);
        assert_ne!(a, sha256_hex("SELECT 2;"));
    }

    #[test]
    fn migration_006_preserves_legacy_rows_and_allows_entity_scoped_rows() {
        let mut conn = test_conn();
        run_pending_migrations(&mut conn).unwrap();

        let (_, etid, eid) = seed(&conn);

        let _fd_legacy = seed_field_def(&conn, &etid, "type", "edad");
        let _fd_new = seed_field_def(&conn, &eid, "entity", "nickname");

        let legacy_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM field_definitions WHERE entity_type_id=?1", [&etid], |r| r.get(0))
            .unwrap();
        assert_eq!(legacy_count, 1);

        let new_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM field_definitions WHERE entity_id=?1", [&eid], |r| r.get(0))
            .unwrap();
        assert_eq!(new_count, 1);
    }

    #[test]
    fn migration_006_check_constraint_rejects_both_owners_set() {
        let mut conn = test_conn();
        run_pending_migrations(&mut conn).unwrap();
        let (_, etid, eid) = seed(&conn);

        let result = conn.execute(
            "INSERT INTO field_definitions(id,entity_type_id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-bad',?1,?2,'x','X','text',0,'private',0,'2026-01-01')",
            [&etid, &eid],
        );
        assert!(result.is_err());
    }

    #[test]
    fn migration_006_check_constraint_rejects_neither_owner_set() {
        let mut conn = test_conn();
        run_pending_migrations(&mut conn).unwrap();
        let result = conn.execute(
            "INSERT INTO field_definitions(id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-bad','x','X','text',0,'private',0,'2026-01-01')",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn migration_006_unique_index_scopes_correctly_per_entity() {
        let mut conn = test_conn();
        run_pending_migrations(&mut conn).unwrap();
        let (_, _, eid) = seed(&conn);

        // Create a second entity
        let eid2 = "e2".to_string();
        conn.execute(
            "INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at)
             VALUES(?1,'p1','et1','Aren','private',1,'2026-01-01','2026-01-01')",
            [&eid2],
        ).unwrap();

        conn.execute(
            "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd1',?1,'nickname','Nickname','text',0,'private',0,'2026-01-01')",
            [&eid],
        ).unwrap();

        // Same name on a different entity is fine.
        conn.execute(
            "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd2',?1,'nickname','Nickname','text',0,'private',0,'2026-01-01')",
            [&eid2],
        ).unwrap();

        // Same name on the SAME entity again must fail.
        let dup = conn.execute(
            "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd3',?1,'nickname','Nickname 2','text',0,'private',0,'2026-01-01')",
            [&eid],
        );
        assert!(dup.is_err());
    }

    #[test]
    fn migration_006_succeeds_with_field_values_fk_references() {
        // Simulate an existing project database at schema version 5 (before
        // migration 6 exists), already containing a field_definitions row and a
        // field_values row that references it — exactly the population migration
        // 6's table-rebuild must not break.
        let mut conn = test_conn();
        ensure_migrations_table(&conn).unwrap();

        // Apply only migrations 1 through 5 directly, leaving migration 6 pending.
        for migration in all_migrations().into_iter().filter(|m| m.version <= 5) {
            apply_migration(&mut conn, &migration).unwrap();
        }

        // Seed data using the pre-migration-6 schema: field_definitions.entity_type_id
        // is still NOT NULL and there is no entity_id column yet.
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES('p1','P','2026-01-01','2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES('et1','p1','Character',0,0,'2026-01-01','2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at)
             VALUES('e1','p1','et1','Kael','private',0,'2026-01-01','2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO field_definitions(id,entity_type_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-legacy','et1','bio','Bio','text',0,'private',0,'2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO field_values(id,entity_id,field_def_id,value_text,updated_at)
             VALUES('fv1','e1','fd-legacy','test','2026-01-01')",
            [],
        ).unwrap();

        // Now apply the remaining pending migration (6). This must succeed, not
        // fail with a FOREIGN KEY constraint error.
        run_pending_migrations(&mut conn).unwrap();

        // The field_values row must survive untouched, still pointing at the same
        // field_definitions row (which now also has entity_id = NULL, entity_type_id
        // unchanged).
        let fv_field_def_id: String = conn
            .query_row("SELECT field_def_id FROM field_values WHERE id='fv1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fv_field_def_id, "fd-legacy");

        let (entity_type_id, entity_id): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT entity_type_id, entity_id FROM field_definitions WHERE id='fd-legacy'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(entity_type_id.as_deref(), Some("et1"));
        assert_eq!(entity_id, None);
    }
}

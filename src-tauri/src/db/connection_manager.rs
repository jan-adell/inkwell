use rusqlite::Connection;
use std::path::Path;

use crate::error::Result;

pub struct ConnectionManager;

impl ConnectionManager {
    pub fn open(db_path: &Path) -> Result<Connection> {
        crate::db::open_database(db_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};
    use tempfile::tempdir;

    #[test]
    fn open_and_migrate_file_db() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let mut conn = ConnectionManager::open(&db_path).expect("open database");
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
    }
}

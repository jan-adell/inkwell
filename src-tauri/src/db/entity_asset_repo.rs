use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{InkwellError, Result};
use crate::models::entity_asset::EntityAsset;

fn row_to_asset(row: &rusqlite::Row) -> rusqlite::Result<EntityAsset> {
    Ok(EntityAsset {
        id: row.get(0)?,
        entity_id: row.get(1)?,
        relative_path: row.get(2)?,
        label: row.get(3)?,
        sort_order: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub fn insert(
    conn: &Connection,
    entity_id: &str,
    relative_path: &str,
    label: Option<&str>,
    sort_order: i32,
) -> Result<EntityAsset> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO entity_assets (id, entity_id, relative_path, label, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, entity_id, relative_path, label, sort_order, now],
    )?;
    Ok(EntityAsset {
        id,
        entity_id: entity_id.to_string(),
        relative_path: relative_path.to_string(),
        label: label.map(|s| s.to_string()),
        sort_order,
        created_at: now,
    })
}

pub fn list(conn: &Connection, entity_id: &str) -> Result<Vec<EntityAsset>> {
    let mut stmt = conn.prepare(
        "SELECT id, entity_id, relative_path, label, sort_order, created_at
         FROM entity_assets
         WHERE entity_id = ?1
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], row_to_asset)?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn delete(conn: &Connection, asset_id: &str) -> Result<Option<String>> {
    let relative_path: Option<String> = conn
        .query_row(
            "SELECT relative_path FROM entity_assets WHERE id = ?1",
            params![asset_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(InkwellError::Database)?;

    conn.execute("DELETE FROM entity_assets WHERE id = ?1", params![asset_id])?;

    Ok(relative_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};
    use crate::models::entity::{CreateEntityRequest, Entity};
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
        conn
    }

    fn seed_entity(conn: &Connection) -> Entity {
        crate::db::project_repo::create(conn, "proj-1", "P").unwrap();
        let type_id = {
            let id = ulid::Ulid::new().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO entity_types (id, project_id, name, is_system, sort_order, created_at, updated_at)
                 VALUES (?1, 'proj-1', 'Character', 0, 0, ?2, ?2)",
                params![id, now],
            )
            .unwrap();
            id
        };
        crate::db::entity_repo::create(
            conn,
            "proj-1",
            &CreateEntityRequest {
                entity_type_id: type_id,
                name: "Kael".into(),
                summary: None,
                visibility: None,
                sort_order: None,
            },
        )
        .unwrap()
    }

    #[test]
    fn insert_and_list_asset() {
        let conn = test_conn();
        let entity = seed_entity(&conn);

        let asset = insert(
            &conn,
            &entity.id,
            "assets/entities/kael/portrait.jpg",
            Some("portrait"),
            0,
        )
        .unwrap();
        assert_eq!(asset.entity_id, entity.id);
        assert_eq!(asset.relative_path, "assets/entities/kael/portrait.jpg");
        assert_eq!(asset.label.as_deref(), Some("portrait"));

        let list = list(&conn, &entity.id).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, asset.id);
    }

    #[test]
    fn list_ordered_by_sort_order_then_created_at() {
        let conn = test_conn();
        let entity = seed_entity(&conn);

        insert(&conn, &entity.id, "a.jpg", None, 2).unwrap();
        insert(&conn, &entity.id, "b.jpg", None, 0).unwrap();
        insert(&conn, &entity.id, "c.jpg", None, 1).unwrap();

        let list = list(&conn, &entity.id).unwrap();
        assert_eq!(list[0].relative_path, "b.jpg");
        assert_eq!(list[1].relative_path, "c.jpg");
        assert_eq!(list[2].relative_path, "a.jpg");
    }

    #[test]
    fn delete_returns_path_and_removes_record() {
        let conn = test_conn();
        let entity = seed_entity(&conn);

        let asset = insert(&conn, &entity.id, "portrait.jpg", None, 0).unwrap();
        let path = delete(&conn, &asset.id).unwrap();
        assert_eq!(path.as_deref(), Some("portrait.jpg"));

        let remaining = list(&conn, &entity.id).unwrap();
        assert!(remaining.is_empty());
    }

    #[test]
    fn delete_nonexistent_returns_none() {
        let conn = test_conn();
        let path = delete(&conn, "nonexistent-id").unwrap();
        assert!(path.is_none());
    }
}

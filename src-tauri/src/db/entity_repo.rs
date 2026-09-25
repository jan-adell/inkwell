use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{InkwellError, Result};
use crate::models::entity::{CreateEntityRequest, Entity, UpdateEntityRequest};

fn row_to_entity(row: &rusqlite::Row) -> rusqlite::Result<Entity> {
    Ok(Entity {
        id: row.get(0)?,
        project_id: row.get(1)?,
        entity_type_id: row.get(2)?,
        name: row.get(3)?,
        summary: row.get(4)?,
        cover_image: row.get(5)?,
        visibility: row.get(6)?,
        sort_order: row.get(7)?,
        folder_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

fn validate_visibility(v: &str) -> Result<()> {
    if !matches!(v, "private" | "beta" | "public") {
        return Err(InkwellError::Validation(format!(
            "Invalid visibility '{v}'. Must be 'private', 'beta', or 'public'"
        )));
    }
    Ok(())
}

pub fn create(conn: &Connection, project_id: &str, req: &CreateEntityRequest) -> Result<Entity> {
    // Verify the entity_type exists and belongs to this project
    let type_exists: bool = conn
        .query_row(
            "SELECT 1 FROM entity_types WHERE id=?1 AND project_id=?2 AND deleted_at IS NULL",
            params![req.entity_type_id, project_id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !type_exists {
        return Err(InkwellError::Validation(format!(
            "EntityType '{}' does not exist in this project",
            req.entity_type_id
        )));
    }

    let visibility = req.visibility.as_deref().unwrap_or("private");
    validate_visibility(visibility)?;

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO entities
            (id, project_id, entity_type_id, name, summary,
             visibility, sort_order, folder_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
        params![
            id,
            project_id,
            req.entity_type_id,
            req.name,
            req.summary,
            visibility,
            sort_order,
            req.folder_id,
            now
        ],
    )?;

    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<Entity> {
    conn.query_row(
        "SELECT id,project_id,entity_type_id,name,summary,cover_image,
                visibility,sort_order,folder_id,created_at,updated_at,deleted_at
         FROM entities WHERE id=?1",
        params![id],
        row_to_entity,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("Entity '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

pub fn list(conn: &Connection, project_id: &str) -> Result<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,entity_type_id,name,summary,cover_image,
                visibility,sort_order,folder_id,created_at,updated_at,deleted_at
         FROM entities
         WHERE project_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_entity)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn list_by_type(
    conn: &Connection,
    project_id: &str,
    entity_type_id: &str,
) -> Result<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,entity_type_id,name,summary,cover_image,
                visibility,sort_order,folder_id,created_at,updated_at,deleted_at
         FROM entities
         WHERE project_id=?1 AND entity_type_id=?2 AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC",
    )?;
    let rows = stmt.query_map(params![project_id, entity_type_id], row_to_entity)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn list_root_entities(conn: &Connection, project_id: &str) -> Result<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,entity_type_id,name,summary,cover_image,
                visibility,sort_order,folder_id,created_at,updated_at,deleted_at
         FROM entities
         WHERE project_id=?1 AND folder_id IS NULL AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_entity)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn list_by_folder(conn: &Connection, project_id: &str, folder_id: &str) -> Result<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,entity_type_id,name,summary,cover_image,
                visibility,sort_order,folder_id,created_at,updated_at,deleted_at
         FROM entities
         WHERE project_id=?1 AND folder_id=?2 AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC",
    )?;
    let rows = stmt.query_map(params![project_id, folder_id], row_to_entity)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn update(conn: &Connection, id: &str, req: &UpdateEntityRequest) -> Result<Entity> {
    let current = get(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(ref v) = req.visibility {
        validate_visibility(v)?;
    }

    let name = req.name.as_deref().unwrap_or(&current.name);
    let summary = req.summary.as_deref().or(current.summary.as_deref());
    let cover_image = req
        .cover_image
        .as_deref()
        .or(current.cover_image.as_deref());
    let visibility = req.visibility.as_deref().unwrap_or(&current.visibility);
    let sort_order = req.sort_order.unwrap_or(current.sort_order);
    let folder_id = match &req.folder_id {
        Some(v) => v.as_deref(),
        None => current.folder_id.as_deref(),
    };

    conn.execute(
        "UPDATE entities
         SET name=?1,summary=?2,cover_image=?3,visibility=?4,sort_order=?5,folder_id=?6,updated_at=?7
         WHERE id=?8 AND deleted_at IS NULL",
        params![name, summary, cover_image, visibility, sort_order, folder_id, now, id],
    )?;

    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE entities SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}

pub fn update_notes(
    conn: &Connection,
    entity_id: &str,
    notes_json: &str,
    notes_text: &str,
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let rows = conn.execute(
        "UPDATE entities SET notes_json=?1, notes_text=?2, updated_at=?3
         WHERE id=?4 AND deleted_at IS NULL",
        params![notes_json, notes_text, now, entity_id],
    )?;
    if rows == 0 {
        return Err(InkwellError::NotFound(format!(
            "Entity '{entity_id}' not found"
        )));
    }
    Ok(())
}

pub fn get_notes(conn: &Connection, entity_id: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT notes_json FROM entities WHERE id=?1 AND deleted_at IS NULL",
        params![entity_id],
        |r| r.get::<_, Option<String>>(0),
    )
    .optional()
    .map_err(InkwellError::Database)
    .map(|opt| opt.flatten())
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

    fn seed(conn: &Connection) -> (String, String) {
        let pid = "01PROJ000000000000000000001".to_string();
        let etid = "01ETYPE00000000000000000001".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Personaje',0,0,'2026-01-01','2026-01-01')",
            params![etid, pid],
        ).unwrap();
        (pid, etid)
    }

    fn make_entity(entity_type_id: &str, name: &str) -> CreateEntityRequest {
        CreateEntityRequest {
            entity_type_id: entity_type_id.into(),
            name: name.into(),
            summary: None,
            visibility: None,
            sort_order: None,
            folder_id: None,
        }
    }

    #[test]
    fn create_and_get() {
        let conn = test_conn();
        let (pid, etid) = seed(&conn);
        let e = create(&conn, &pid, &make_entity(&etid, "Kael")).unwrap();
        assert_eq!(e.name, "Kael");
        assert_eq!(e.visibility, "private");
        assert_eq!(get(&conn, &e.id).unwrap().id, e.id);
    }

    #[test]
    fn invalid_entity_type_rejected() {
        let conn = test_conn();
        let (pid, _) = seed(&conn);
        let result = create(&conn, &pid, &make_entity("bad-type", "X"));
        assert!(matches!(result, Err(InkwellError::Validation(_))));
    }

    #[test]
    fn list_by_type_filters_correctly() {
        let conn = test_conn();
        let (pid, etid) = seed(&conn);
        let etid2 = "01ETYPE00000000000000000002".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Lugar',0,0,'2026-01-01','2026-01-01')",
            params![etid2, pid],
        ).unwrap();
        create(&conn, &pid, &make_entity(&etid, "Kael")).unwrap();
        create(&conn, &pid, &make_entity(&etid2, "Valthera")).unwrap();

        let chars = list_by_type(&conn, &pid, &etid).unwrap();
        assert_eq!(chars.len(), 1);
        assert_eq!(chars[0].name, "Kael");
    }

    #[test]
    fn soft_delete() {
        let conn = test_conn();
        let (pid, etid) = seed(&conn);
        let e = create(&conn, &pid, &make_entity(&etid, "Arven")).unwrap();
        delete(&conn, &e.id).unwrap();
        assert!(get(&conn, &e.id).unwrap().deleted_at.is_some());
        assert!(list(&conn, &pid).unwrap().is_empty());
    }

    #[test]
    fn list_root_entities_excludes_folder_members() {
        let conn = test_conn();
        let (pid, etid) = seed(&conn);
        let fid = "01FOLDER0000000000000000001".to_string();
        conn.execute(
            "INSERT INTO entity_folders(id,project_id,name,sort_order,created_at)
             VALUES(?1,?2,'Heroes',0,'2026-01-01')",
            params![fid, pid],
        )
        .unwrap();

        let root = create(&conn, &pid, &make_entity(&etid, "Kael")).unwrap();
        let in_folder = create(
            &conn,
            &pid,
            &CreateEntityRequest {
                entity_type_id: etid.clone(),
                name: "Arven".into(),
                summary: None,
                visibility: None,
                sort_order: None,
                folder_id: Some(fid.clone()),
            },
        )
        .unwrap();

        let roots = list_root_entities(&conn, &pid).unwrap();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].id, root.id);

        let folder_members = list_by_folder(&conn, &pid, &fid).unwrap();
        assert_eq!(folder_members.len(), 1);
        assert_eq!(folder_members[0].id, in_folder.id);
    }
}

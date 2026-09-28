use rusqlite::{params, Connection, OptionalExtension};

use crate::db::{entity_type_repo, field_definition_repo};
use crate::error::{InkwellError, Result};
use crate::models::entity::{CreateEntityRequest, Entity, UpdateEntityRequest};
use crate::models::entity_template::EntityTemplate;
use crate::models::field_definition::CreateFieldDefinitionRequest;

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

pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateEntityRequest,
    templates: &[EntityTemplate],
) -> Result<Entity> {
    let visibility = req.visibility.as_deref().unwrap_or("private");
    validate_visibility(visibility)?;

    let matching_template = templates.iter().find(|t| t.name == req.entity_type_name);
    let (name_plural, color) = matching_template
        .map(|t| (t.name_plural.as_str(), t.color.as_str()))
        .unwrap_or((req.entity_type_name.as_str(), "#6B7280"));

    let tx = conn.unchecked_transaction()?;
    let entity_type = entity_type_repo::get_or_create_by_name(
        &tx,
        project_id,
        &req.entity_type_name,
        name_plural,
        color,
    )?;

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);

    tx.execute(
        "INSERT INTO entities
            (id, project_id, entity_type_id, name, summary,
             visibility, sort_order, folder_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
        params![
            id,
            project_id,
            entity_type.id,
            req.name,
            req.summary,
            visibility,
            sort_order,
            req.folder_id,
            now
        ],
    )?;

    if let Some(template) = matching_template {
        let legacy_names: std::collections::HashSet<String> =
            field_definition_repo::list_by_entity_type(&tx, &entity_type.id)?
                .into_iter()
                .map(|f| f.name)
                .collect();
        for (i, field) in template
            .fields
            .iter()
            .filter(|f| !legacy_names.contains(&f.name))
            .enumerate()
        {
            field_definition_repo::create(
                &tx,
                &CreateFieldDefinitionRequest {
                    entity_id: id.clone(),
                    name: field.name.clone(),
                    label: field.label.clone(),
                    field_type: field.field_type.clone(),
                    options: field.options.clone(),
                    default_value: field.default_value.clone(),
                    is_required: None,
                    visibility: None,
                    sort_order: Some(i as i64),
                },
            )?;
        }
    }

    tx.commit()?;
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
    use crate::db::field_definition_repo;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};
    use crate::models::entity_template::DefaultField;

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

    fn make_entity(entity_type_name: &str, name: &str) -> CreateEntityRequest {
        CreateEntityRequest {
            entity_type_name: entity_type_name.into(),
            name: name.into(),
            summary: None,
            visibility: None,
            sort_order: None,
            folder_id: None,
        }
    }

    fn character_template() -> EntityTemplate {
        EntityTemplate {
            id: "tmpl-character".to_string(),
            name: "Character".to_string(),
            name_plural: "Characters".to_string(),
            color: "#8B6FE8".to_string(),
            fields: vec![
                DefaultField {
                    name: "birth_date".into(),
                    label: "Birth Date".into(),
                    field_type: "date".into(),
                    options: None,
                    default_value: None,
                },
                DefaultField {
                    name: "height".into(),
                    label: "Height".into(),
                    field_type: "number".into(),
                    options: Some(r#"{"unit":"cm"}"#.into()),
                    default_value: None,
                },
                DefaultField {
                    name: "eye_color".into(),
                    label: "Eye Color".into(),
                    field_type: "select".into(),
                    options: Some(
                        r#"["Brown","Blue","Green","Hazel","Gray","Amber","Other"]"#.into(),
                    ),
                    default_value: None,
                },
                DefaultField {
                    name: "occupation".into(),
                    label: "Occupation".into(),
                    field_type: "text".into(),
                    options: None,
                    default_value: None,
                },
                DefaultField {
                    name: "personality".into(),
                    label: "Personality".into(),
                    field_type: "textarea".into(),
                    options: None,
                    default_value: None,
                },
                DefaultField {
                    name: "alive".into(),
                    label: "Alive".into(),
                    field_type: "boolean".into(),
                    options: None,
                    default_value: Some("true".into()),
                },
            ],
        }
    }

    #[test]
    fn create_and_get() {
        let conn = test_conn();
        let (pid, _etid) = seed(&conn);
        let e = create(&conn, &pid, &make_entity("Personaje", "Kael"), &[]).unwrap();
        assert_eq!(e.name, "Kael");
        assert_eq!(e.visibility, "private");
        assert_eq!(get(&conn, &e.id).unwrap().id, e.id);
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
        create(&conn, &pid, &make_entity("Personaje", "Kael"), &[]).unwrap();
        create(&conn, &pid, &make_entity("Lugar", "Valthera"), &[]).unwrap();

        let chars = list_by_type(&conn, &pid, &etid).unwrap();
        assert_eq!(chars.len(), 1);
        assert_eq!(chars[0].name, "Kael");
    }

    #[test]
    fn soft_delete() {
        let conn = test_conn();
        let (pid, _etid) = seed(&conn);
        let e = create(&conn, &pid, &make_entity("Personaje", "Arven"), &[]).unwrap();
        delete(&conn, &e.id).unwrap();
        assert!(get(&conn, &e.id).unwrap().deleted_at.is_some());
        assert!(list(&conn, &pid).unwrap().is_empty());
    }

    #[test]
    fn list_root_entities_excludes_folder_members() {
        let conn = test_conn();
        let (pid, _etid) = seed(&conn);
        let fid = "01FOLDER0000000000000000001".to_string();
        conn.execute(
            "INSERT INTO entity_folders(id,project_id,name,sort_order,created_at)
             VALUES(?1,?2,'Heroes',0,'2026-01-01')",
            params![fid, pid],
        )
        .unwrap();

        let root = create(&conn, &pid, &make_entity("Personaje", "Kael"), &[]).unwrap();
        let in_folder = create(
            &conn,
            &pid,
            &CreateEntityRequest {
                entity_type_name: "Personaje".into(),
                name: "Arven".into(),
                summary: None,
                visibility: None,
                sort_order: None,
                folder_id: Some(fid.clone()),
            },
            &[],
        )
        .unwrap();

        let roots = list_root_entities(&conn, &pid).unwrap();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].id, root.id);

        let folder_members = list_by_folder(&conn, &pid, &fid).unwrap();
        assert_eq!(folder_members.len(), 1);
        assert_eq!(folder_members[0].id, in_folder.id);
    }

    #[test]
    fn create_applies_default_properties_for_a_recognized_type_name() {
        let conn = test_conn();
        let pid = "01PROJ000000000000000000002".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();

        let templates = vec![character_template()];
        let entity = create(&conn, &pid, &make_entity("Character", "Kael"), &templates).unwrap();

        let fields = field_definition_repo::list_by_entity(&conn, &entity.id).unwrap();
        assert_eq!(fields.len(), 6);
        assert_eq!(fields[0].name, "birth_date");
        assert_eq!(fields[0].entity_id.as_deref(), Some(entity.id.as_str()));
    }

    #[test]
    fn create_gives_two_entities_of_the_same_type_fully_independent_properties() {
        let conn = test_conn();
        let pid = "01PROJ000000000000000000003".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();

        let templates = vec![character_template()];
        let kael = create(&conn, &pid, &make_entity("Character", "Kael"), &templates).unwrap();
        let aren = create(&conn, &pid, &make_entity("Character", "Aren"), &templates).unwrap();

        let kael_fields = field_definition_repo::list_by_entity(&conn, &kael.id).unwrap();
        let aren_fields = field_definition_repo::list_by_entity(&conn, &aren.id).unwrap();
        assert_eq!(kael_fields.len(), 6);
        assert_eq!(aren_fields.len(), 6);
        assert_ne!(kael_fields[0].id, aren_fields[0].id);

        field_definition_repo::delete(&conn, &kael_fields[0].id).unwrap();
        let kael_fields_after = field_definition_repo::list_by_entity(&conn, &kael.id).unwrap();
        let aren_fields_after = field_definition_repo::list_by_entity(&conn, &aren.id).unwrap();
        assert_eq!(kael_fields_after.len(), 5);
        assert_eq!(aren_fields_after.len(), 6);
    }

    #[test]
    fn create_gives_no_default_properties_for_unrecognized_or_blank_type_names() {
        let conn = test_conn();
        let pid = "01PROJ000000000000000000004".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();

        let templates = vec![character_template()];
        let blank_entity =
            create(&conn, &pid, &make_entity("Entity", "Something"), &templates).unwrap();
        let custom_entity = create(
            &conn,
            &pid,
            &make_entity("MyCustomType", "Something Else"),
            &templates,
        )
        .unwrap();

        assert!(
            field_definition_repo::list_by_entity(&conn, &blank_entity.id)
                .unwrap()
                .is_empty()
        );
        assert!(
            field_definition_repo::list_by_entity(&conn, &custom_entity.id)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn create_skips_catalog_fields_colliding_with_a_legacy_type_scoped_name() {
        let conn = test_conn();
        let pid = "01PROJ000000000000000000005".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();
        let etid = "01ETYPE00000000000000000006".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Character',0,0,'2026-01-01','2026-01-01')",
            params![etid, pid],
        ).unwrap();
        conn.execute(
            "INSERT INTO field_definitions(id,entity_type_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-legacy-height',?1,'height','Height','number',0,'private',0,'2026-01-01')",
            params![etid],
        ).unwrap();

        let templates = vec![character_template()];
        let entity = create(&conn, &pid, &make_entity("Character", "Kael"), &templates).unwrap();

        let fields = field_definition_repo::list_by_entity(&conn, &entity.id).unwrap();
        let names: Vec<&str> = fields.iter().map(|f| f.name.as_str()).collect();

        assert!(!names.contains(&"height"));
        assert!(names.contains(&"birth_date"));
        assert!(names.contains(&"eye_color"));
        assert!(names.contains(&"occupation"));
        assert!(names.contains(&"personality"));
        assert!(names.contains(&"alive"));
        assert_eq!(fields.len(), 5);
    }

    #[test]
    fn create_lazily_creates_entity_type_for_a_new_name() {
        let conn = test_conn();
        let pid = "01PROJ000000000000000000006".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();

        assert!(entity_type_repo::list(&conn, &pid).unwrap().is_empty());

        let template = EntityTemplate {
            id: "tmpl-planet".to_string(),
            name: "Planet".to_string(),
            name_plural: "Planets".to_string(),
            color: "#00FFAA".to_string(),
            fields: vec![],
        };
        create(&conn, &pid, &make_entity("Planet", "Zorg"), &[template]).unwrap();

        let types = entity_type_repo::list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].name, "Planet");
        assert_eq!(types[0].name_plural.as_deref(), Some("Planets"));
        assert_eq!(types[0].color.as_deref(), Some("#00FFAA"));
    }

    #[test]
    fn create_rolls_back_everything_when_a_template_field_insert_fails() {
        let conn = test_conn();
        let pid = "01PROJ000000000000000000007".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();

        let notes = DefaultField {
            name: "notes".into(),
            label: "Notes".into(),
            field_type: "text".into(),
            options: None,
            default_value: None,
        };
        let template = EntityTemplate {
            id: "tmpl-broken".to_string(),
            name: "Broken".to_string(),
            name_plural: "Brokens".to_string(),
            color: "#123456".to_string(),
            fields: vec![notes.clone(), notes],
        };

        let result = create(&conn, &pid, &make_entity("Broken", "Half"), &[template]);

        assert!(matches!(result, Err(InkwellError::Conflict(_))));
        assert!(list(&conn, &pid).unwrap().is_empty());
        assert!(entity_type_repo::list(&conn, &pid).unwrap().is_empty());
        let orphan_fields: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM field_definitions WHERE entity_id IS NOT NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphan_fields, 0);
    }

    #[test]
    fn create_reuses_existing_entity_type_with_the_same_name() {
        let conn = test_conn();
        let (pid, etid) = seed(&conn);
        create(&conn, &pid, &make_entity("Personaje", "Kael"), &[]).unwrap();
        create(&conn, &pid, &make_entity("Personaje", "Aren"), &[]).unwrap();

        let types = entity_type_repo::list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].id, etid);
    }
}

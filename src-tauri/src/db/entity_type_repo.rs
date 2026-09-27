use rusqlite::{params, Connection};

use crate::error::{InkwellError, Result};
use crate::models::entity_type::{CreateEntityTypeRequest, EntityType, UpdateEntityTypeRequest};

struct DefaultField {
    name: &'static str,
    label: &'static str,
    field_type: &'static str,
    options: Option<&'static str>,
    default_value: Option<&'static str>,
}

const fn field(name: &'static str, label: &'static str, field_type: &'static str) -> DefaultField {
    DefaultField {
        name,
        label,
        field_type,
        options: None,
        default_value: None,
    }
}

const fn field_with_options(
    name: &'static str,
    label: &'static str,
    field_type: &'static str,
    options: &'static str,
) -> DefaultField {
    DefaultField {
        name,
        label,
        field_type,
        options: Some(options),
        default_value: None,
    }
}

const CHARACTER_FIELDS: &[DefaultField] = &[
    field("birth_date", "Birth Date", "date"),
    field_with_options("height", "Height", "number", r#"{"unit":"cm"}"#),
    field_with_options(
        "eye_color",
        "Eye Color",
        "select",
        r#"["Brown","Blue","Green","Hazel","Gray","Amber","Other"]"#,
    ),
    field("occupation", "Occupation", "text"),
    field("personality", "Personality", "textarea"),
    DefaultField {
        name: "alive",
        label: "Alive",
        field_type: "boolean",
        options: None,
        default_value: Some("true"),
    },
];

const LOCATION_FIELDS: &[DefaultField] = &[
    field("description", "Description", "textarea"),
    field_with_options(
        "climate",
        "Climate",
        "select",
        r#"["Tropical","Arid","Temperate","Continental","Polar","Mediterranean","Other"]"#,
    ),
    field("population", "Population", "number"),
    field("founded", "Founded", "date"),
    field("region", "Region", "text"),
    field("notable_landmark", "Notable Landmark", "text"),
];

const ITEM_FIELDS: &[DefaultField] = &[
    field("description", "Description", "textarea"),
    field("material", "Material", "text"),
    field("value", "Value", "number"),
    field_with_options(
        "rarity",
        "Rarity",
        "select",
        r#"["Common","Uncommon","Rare","Legendary","Unique"]"#,
    ),
    field("origin", "Origin", "textarea"),
    field("magical", "Magical", "boolean"),
];

const EVENT_FIELDS: &[DefaultField] = &[
    field("description", "Description", "textarea"),
    field("date", "Date", "date"),
    field("duration", "Duration", "text"),
    field("outcome", "Outcome", "textarea"),
    field_with_options(
        "significance",
        "Significance",
        "select",
        r#"["Minor","Notable","Major","Pivotal"]"#,
    ),
    field("casualties", "Casualties", "number"),
];

const ORGANIZATION_FIELDS: &[DefaultField] = &[
    field("description", "Description", "textarea"),
    field("founded", "Founded", "date"),
    field_with_options(
        "type",
        "Type",
        "select",
        r#"["Government","Guild","Religious","Military","Criminal","Commercial","Academic","Other"]"#,
    ),
    field("headquarters", "Headquarters", "text"),
    field("motto", "Motto", "text"),
    field("active", "Active", "boolean"),
];

fn default_fields_for(entity_type_name: &str) -> &'static [DefaultField] {
    match entity_type_name {
        "Character" => CHARACTER_FIELDS,
        "Location" => LOCATION_FIELDS,
        "Item" => ITEM_FIELDS,
        "Event" => EVENT_FIELDS,
        "Organization" => ORGANIZATION_FIELDS,
        _ => &[],
    }
}

fn row_to_entity_type(row: &rusqlite::Row) -> rusqlite::Result<EntityType> {
    Ok(EntityType {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        name_plural: row.get(3)?,
        icon: row.get(4)?,
        color: row.get(5)?,
        description: row.get(6)?,
        is_system: row.get::<_, i64>(7)? != 0,
        sort_order: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateEntityTypeRequest,
) -> Result<EntityType> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO entity_types
            (id, project_id, name, name_plural, icon, color, description,
             is_system, sort_order, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,?9,?9)",
        params![
            id,
            project_id,
            req.name,
            req.name_plural,
            req.icon,
            req.color,
            req.description,
            sort_order,
            now
        ],
    )?;

    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<EntityType> {
    conn.query_row(
        "SELECT id,project_id,name,name_plural,icon,color,description,
                is_system,sort_order,created_at,updated_at,deleted_at
         FROM entity_types WHERE id=?1",
        params![id],
        row_to_entity_type,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("EntityType '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

pub fn list(conn: &Connection, project_id: &str) -> Result<Vec<EntityType>> {
    let mut stmt = conn.prepare(
        "SELECT id,project_id,name,name_plural,icon,color,description,
                is_system,sort_order,created_at,updated_at,deleted_at
         FROM entity_types
         WHERE project_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC",
    )?;

    let rows = stmt.query_map(params![project_id], row_to_entity_type)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn update(conn: &Connection, id: &str, req: &UpdateEntityTypeRequest) -> Result<EntityType> {
    let now = chrono::Utc::now().to_rfc3339();
    let current = get(conn, id)?;

    let name = req.name.as_deref().unwrap_or(&current.name);
    let name_plural = req
        .name_plural
        .as_deref()
        .or(current.name_plural.as_deref());
    let icon = req.icon.as_deref().or(current.icon.as_deref());
    let color = req.color.as_deref().or(current.color.as_deref());
    let description = req
        .description
        .as_deref()
        .or(current.description.as_deref());
    let sort_order = req.sort_order.unwrap_or(current.sort_order);

    conn.execute(
        "UPDATE entity_types
         SET name=?1, name_plural=?2, icon=?3, color=?4, description=?5,
             sort_order=?6, updated_at=?7
         WHERE id=?8 AND deleted_at IS NULL",
        params![
            name,
            name_plural,
            icon,
            color,
            description,
            sort_order,
            now,
            id
        ],
    )?;

    get(conn, id)
}

/// Ensures every default entity type exists in the project, creating whichever
/// ones (by name) are still missing along with their default field_definitions.
/// A type that already exists — regardless of how the project came to have it —
/// is never modified. Safe to call on every project open, for any project.
pub fn seed_defaults(conn: &Connection, project_id: &str) -> Result<()> {
    let existing = list(conn, project_id)?;
    let existing_names: std::collections::HashSet<&str> =
        existing.iter().map(|t| t.name.as_str()).collect();
    let mut next_sort_order = existing
        .iter()
        .map(|t| t.sort_order)
        .max()
        .map(|m| m + 1)
        .unwrap_or(0);

    let defaults = [
        ("Character", "Characters", "#8B6FE8"),
        ("Location", "Locations", "#4EA86B"),
        ("Item", "Items", "#E8883A"),
        ("Event", "Events", "#4A9FD4"),
        ("Organization", "Organizations", "#D44A7A"),
        ("Entity", "Entities", "#6B7280"),
    ];

    for (name, plural, color) in defaults.iter() {
        if existing_names.contains(name) {
            continue;
        }

        let entity_type = create(
            conn,
            project_id,
            &CreateEntityTypeRequest {
                name: name.to_string(),
                name_plural: Some(plural.to_string()),
                icon: None,
                color: Some(color.to_string()),
                description: None,
                sort_order: Some(next_sort_order),
            },
        )?;
        next_sort_order += 1;

        for (j, default_field) in default_fields_for(name).iter().enumerate() {
            let fd_id = ulid::Ulid::new().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO field_definitions(id,entity_type_id,name,label,field_type,
                    options,default_value,is_required,visibility,sort_order,created_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    fd_id,
                    entity_type.id.clone(),
                    default_field.name.to_string(),
                    default_field.label.to_string(),
                    default_field.field_type.to_string(),
                    default_field.options.map(|s| s.to_string()),
                    default_field.default_value.map(|s| s.to_string()),
                    0i64,
                    "private",
                    j as i64,
                    now
                ],
            )?;
        }
    }
    Ok(())
}

/// Soft-delete. Refuses to delete system types.
pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    let current = get(conn, id)?;

    if current.is_system {
        return Err(InkwellError::Forbidden(format!(
            "EntityType '{id}' is a system type and cannot be deleted"
        )));
    }

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE entity_types SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
        params![now, id],
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::field_definition_repo;
    use crate::db::migrations::{ensure_migrations_table, run_pending_migrations};

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_migrations_table(&conn).unwrap();
        run_pending_migrations(&mut conn).unwrap();
        conn
    }

    fn seed_project(conn: &Connection) -> String {
        let pid = "01TEST_PROJECT_000000000001".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'Test','2026-01-01','2026-01-01')",
            params![pid],
        )
        .unwrap();
        pid
    }

    #[test]
    fn create_and_get() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let req = CreateEntityTypeRequest {
            name: "Personaje".into(),
            name_plural: Some("Personajes".into()),
            icon: None,
            color: None,
            description: None,
            sort_order: None,
        };
        let et = create(&conn, &pid, &req).unwrap();
        assert_eq!(et.name, "Personaje");
        assert!(!et.is_system);

        let fetched = get(&conn, &et.id).unwrap();
        assert_eq!(fetched.id, et.id);
    }

    #[test]
    fn list_returns_active_only() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let req = |name: &str| CreateEntityTypeRequest {
            name: name.into(),
            name_plural: None,
            icon: None,
            color: None,
            description: None,
            sort_order: None,
        };
        create(&conn, &pid, &req("Lugar")).unwrap();
        let et2 = create(&conn, &pid, &req("Objeto")).unwrap();
        delete(&conn, &et2.id).unwrap();

        let list = list(&conn, &pid).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Lugar");
    }

    #[test]
    fn update_partial() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let et = create(
            &conn,
            &pid,
            &CreateEntityTypeRequest {
                name: "Criatura".into(),
                name_plural: None,
                icon: None,
                color: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();

        let updated = update(
            &conn,
            &et.id,
            &UpdateEntityTypeRequest {
                name: Some("Monstruo".into()),
                name_plural: None,
                icon: None,
                color: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Monstruo");
    }

    #[test]
    fn soft_delete() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let et = create(
            &conn,
            &pid,
            &CreateEntityTypeRequest {
                name: "Facción".into(),
                name_plural: None,
                icon: None,
                color: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();
        delete(&conn, &et.id).unwrap();

        let fetched = get(&conn, &et.id).unwrap();
        assert!(fetched.deleted_at.is_some());
    }

    #[test]
    fn seed_defaults_creates_six_types() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        seed_defaults(&conn, &pid).unwrap();
        let types = list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 6);
        let names: Vec<&str> = types.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Character"));
        assert!(names.contains(&"Location"));
        assert!(names.contains(&"Item"));
        assert!(names.contains(&"Event"));
        assert!(names.contains(&"Organization"));
        assert!(names.contains(&"Entity"));
    }

    #[test]
    fn seed_defaults_is_idempotent() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        seed_defaults(&conn, &pid).unwrap();
        seed_defaults(&conn, &pid).unwrap();
        let types = list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 6);
    }

    fn field_names_and_types(conn: &Connection, entity_type_id: &str) -> Vec<(String, String)> {
        field_definition_repo::list_by_entity_type(conn, entity_type_id)
            .unwrap()
            .into_iter()
            .map(|f| (f.name, f.field_type))
            .collect()
    }

    #[test]
    fn seed_defaults_entity_type_has_no_fields() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        seed_defaults(&conn, &pid).unwrap();
        let types = list(&conn, &pid).unwrap();
        let entity_type = types.iter().find(|t| t.name == "Entity").unwrap();
        assert!(
            field_definition_repo::list_by_entity_type(&conn, &entity_type.id)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn seed_defaults_character_gets_expected_fields() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        seed_defaults(&conn, &pid).unwrap();
        let types = list(&conn, &pid).unwrap();
        let character = types.iter().find(|t| t.name == "Character").unwrap();
        let fields = field_names_and_types(&conn, &character.id);
        assert_eq!(
            fields,
            vec![
                ("birth_date".to_string(), "date".to_string()),
                ("height".to_string(), "number".to_string()),
                ("eye_color".to_string(), "select".to_string()),
                ("occupation".to_string(), "text".to_string()),
                ("personality".to_string(), "textarea".to_string()),
                ("alive".to_string(), "boolean".to_string()),
            ]
        );
    }

    #[test]
    fn seed_defaults_named_types_each_get_six_fields() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        seed_defaults(&conn, &pid).unwrap();
        let types = list(&conn, &pid).unwrap();
        for name in ["Location", "Item", "Event", "Organization"] {
            let et = types.iter().find(|t| t.name == name).unwrap();
            let fields = field_definition_repo::list_by_entity_type(&conn, &et.id).unwrap();
            assert_eq!(fields.len(), 6, "expected 6 fields for {name}");
        }
    }

    #[test]
    fn seed_defaults_assigns_sort_order_in_order() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        seed_defaults(&conn, &pid).unwrap();
        let types = list(&conn, &pid).unwrap();
        for (i, t) in types.iter().enumerate() {
            assert_eq!(t.sort_order, i as i64);
        }
    }

    #[test]
    fn seed_defaults_adds_missing_defaults_alongside_a_custom_type() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        create(
            &conn,
            &pid,
            &CreateEntityTypeRequest {
                name: "Custom".into(),
                name_plural: None,
                icon: None,
                color: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();
        seed_defaults(&conn, &pid).unwrap();
        let types = list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 7);
        let names: Vec<&str> = types.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Custom"));
        assert!(names.contains(&"Character"));
        assert!(names.contains(&"Entity"));
    }

    #[test]
    fn seed_defaults_adds_only_missing_types_to_an_existing_project() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        // Simulate a project seeded before the "Entity" type / default fields existed:
        // the 5 named types already exist, with no field_definitions of their own.
        let character = create(
            &conn,
            &pid,
            &CreateEntityTypeRequest {
                name: "Character".into(),
                name_plural: Some("Characters".into()),
                icon: None,
                color: None,
                description: None,
                sort_order: Some(0),
            },
        )
        .unwrap();
        for (i, name) in ["Location", "Item", "Event", "Organization"]
            .iter()
            .enumerate()
        {
            create(
                &conn,
                &pid,
                &CreateEntityTypeRequest {
                    name: name.to_string(),
                    name_plural: None,
                    icon: None,
                    color: None,
                    description: None,
                    sort_order: Some(i as i64 + 1),
                },
            )
            .unwrap();
        }

        seed_defaults(&conn, &pid).unwrap();

        let types = list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 6);
        assert!(types.iter().any(|t| t.name == "Entity"));

        // The pre-existing Character type must be untouched: same row, still no fields.
        let refetched = get(&conn, &character.id).unwrap();
        assert_eq!(refetched.id, character.id);
        assert!(
            field_definition_repo::list_by_entity_type(&conn, &character.id)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn cannot_delete_system_type() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        // Insert a system type directly
        let sid = "01SYSTEM_TYPE_000000000001".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'System',1,0,'2026-01-01','2026-01-01')",
            params![sid, pid],
        )
        .unwrap();

        let result = delete(&conn, &sid);
        assert!(matches!(result, Err(InkwellError::Forbidden(_))));
    }
}

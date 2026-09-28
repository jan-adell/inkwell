# Entity Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move "default properties per entity type name" from a hardcoded Rust catalog into an application-level, user-editable template store (a new "Entity Types" Settings tab), and make a project's own `entity_types` table populate lazily (only names actually used) instead of via batch pre-seeding.

**Architecture:** A new JSON-file-backed app-level store (`entity_templates.json` in Tauri's `app_data_dir`), mirroring the existing `registry.rs` pattern exactly. `entity_repo::create` changes from taking an existing `entity_type_id` to taking a type **name**, and does a lookup-or-create of the project's own `entity_types` row for that name — the only place that table ever gains a row. `entity_type_repo::seed_defaults` and `default_properties.rs` are deleted entirely.

**Tech Stack:** Rust (rusqlite, Tauri 2 commands, serde_json for the template file), React + TypeScript (Zustand store, Vite/Vitest).

**Spec:** `docs/superpowers/specs/2026-09-29-entity-templates-design.md`

## Global Constraints

- Entity templates are pure application configuration — never written into any project's `project.db`, never differ per-project.
- `entity_types` stays a project-local table with the exact schema it has today (`id, project_id, name, name_plural, icon, color, description, is_system, sort_order, created_at, updated_at, deleted_at`) — only its population mechanism changes.
- Editing, renaming, or deleting a template must never retroactively change anything already created in any project. Matching against a project's entity type is always by the template's **current** `name` string, never by template `id`.
- A pre-existing project's `entity_types`/`entities`/`field_definitions` rows are never touched by this work.
- Follow existing project conventions: TDD (write the failing test first), `cargo fmt`/`cargo clippy -- -D warnings` clean, `npx tsc --noEmit`/`npx vitest run` clean. Mirror `db/registry.rs`'s storage pattern for the new JSON-backed store, and `models/entity_type.rs` + `db/entity_type_repo.rs`'s model/repo split convention for the new `entity_template` resource (separate `Create.../Update...Request` types from the main model, matching this codebase's established convention for every other CRUD resource).

## Review Focus

- A project that already has `entity_types` rows (from the now-deleted `seed_defaults`, i.e. every project created before this work) must keep working identically — `get_or_create_by_name` must find and reuse those existing rows by name, never create a duplicate.
- Deleting a template must not affect any entity, entity type, or property already created in any project, anywhere.
- Creating an entity whose type name matches **no** template must still succeed, with zero default properties and a sensible fallback color — not an error.
- The legacy-type-scoped-field-name collision guard (an entity type that already has `entity_type_id`-scoped legacy `field_definitions` from before the entity-scoped-properties feature) must survive this rewrite — a newly-created entity of that type must not get a duplicate-named catalog field.
- `entityTemplates` in the frontend store is app-level, not project data — it must survive `resetProjectState()` (project switches / going back to the library). A regression here would silently empty the "Add New" picker and the Entity Editor every time a project is closed.

---

## Task 1: `models/entity_template.rs` + `db/entity_templates.rs` — app-level template storage

**Files:**
- Create: `src-tauri/src/models/entity_template.rs`
- Create: `src-tauri/src/db/entity_templates.rs`
- Modify: `src-tauri/src/models/mod.rs` (register module — read it first to match its existing style)
- Modify: `src-tauri/src/db/mod.rs` (register module — same style as the existing `pub mod` list)

**Interfaces:**
- Consumes: nothing.
- Produces: `pub struct DefaultField { pub name: String, pub label: String, pub field_type: String, pub options: Option<String>, pub default_value: Option<String> }`, `pub struct EntityTemplate { pub id: String, pub name: String, pub name_plural: String, pub color: String, pub fields: Vec<DefaultField> }`, `pub struct CreateEntityTemplateRequest { pub name: String, pub name_plural: String, pub color: String, pub fields: Vec<DefaultField> }`, `pub struct UpdateEntityTemplateRequest { pub name: Option<String>, pub name_plural: Option<String>, pub color: Option<String>, pub fields: Option<Vec<DefaultField>> }` (all in `models::entity_template`), and `entity_templates::load(app_data_dir) -> Result<Vec<EntityTemplate>>`, `entity_templates::create(app_data_dir, &CreateEntityTemplateRequest) -> Result<EntityTemplate>`, `entity_templates::update(app_data_dir, id, &UpdateEntityTemplateRequest) -> Result<EntityTemplate>`, `entity_templates::delete(app_data_dir, id) -> Result<()>`. Task 6 (`commands/entity_templates.rs`) and Task 2 (`entity_repo::create`) both consume `EntityTemplate`/`DefaultField`.

- [ ] **Step 1: Write the model file**

Create `src-tauri/src/models/entity_template.rs`:

```rust
use serde::{Deserialize, Serialize};

/// A single default property definition within an entity template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultField {
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
}

/// An application-level entity type template: a name, a color, and a set of
/// default properties applied to any entity created with a matching type
/// name. Stored in entity_templates.json in the app's data directory —
/// never written into any project's own database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityTemplate {
    pub id: String,
    pub name: String,
    pub name_plural: String,
    pub color: String,
    pub fields: Vec<DefaultField>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateEntityTemplateRequest {
    pub name: String,
    pub name_plural: String,
    pub color: String,
    pub fields: Vec<DefaultField>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateEntityTemplateRequest {
    pub name: Option<String>,
    pub name_plural: Option<String>,
    pub color: Option<String>,
    pub fields: Option<Vec<DefaultField>>,
}
```

- [ ] **Step 2: Register the model module**

Run: `grep -n "pub mod" src-tauri/src/models/mod.rs`
Add `pub mod entity_template;` matching whatever style/ordering is already there.

- [ ] **Step 3: Write the failing tests for storage**

Create `src-tauri/src/db/entity_templates.rs` with just the module skeleton and this test block first (to confirm RED before writing the real implementation):

```rust
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{InkwellError, Result};
use crate::models::entity_template::{
    CreateEntityTemplateRequest, DefaultField, EntityTemplate, UpdateEntityTemplateRequest,
};

fn templates_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("entity_templates.json")
}

pub fn load(_app_data_dir: &Path) -> Result<Vec<EntityTemplate>> {
    todo!()
}

fn save(_app_data_dir: &Path, _templates: &[EntityTemplate]) -> Result<()> {
    todo!()
}

pub fn create(_app_data_dir: &Path, _req: &CreateEntityTemplateRequest) -> Result<EntityTemplate> {
    todo!()
}

pub fn update(
    _app_data_dir: &Path,
    _id: &str,
    _req: &UpdateEntityTemplateRequest,
) -> Result<EntityTemplate> {
    todo!()
}

pub fn delete(_app_data_dir: &Path, _id: &str) -> Result<()> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn load_seeds_builtins_on_first_call() {
        let dir = tempdir().unwrap();
        let templates = load(dir.path()).unwrap();
        assert_eq!(templates.len(), 5);
        let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Character"));
        assert!(names.contains(&"Location"));
        assert!(names.contains(&"Item"));
        assert!(names.contains(&"Event"));
        assert!(names.contains(&"Organization"));
    }

    #[test]
    fn load_does_not_reseed_on_second_call() {
        let dir = tempdir().unwrap();
        let first = load(dir.path()).unwrap();
        let second = load(dir.path()).unwrap();
        assert_eq!(second.len(), 5);
        assert_eq!(first[0].id, second[0].id);
    }

    #[test]
    fn create_adds_a_template() {
        let dir = tempdir().unwrap();
        load(dir.path()).unwrap(); // seed
        let req = CreateEntityTemplateRequest {
            name: "Planet".to_string(),
            name_plural: "Planets".to_string(),
            color: "#00FFAA".to_string(),
            fields: vec![DefaultField {
                name: "radius_km".to_string(),
                label: "Radius (km)".to_string(),
                field_type: "number".to_string(),
                options: None,
                default_value: None,
            }],
        };
        let created = create(dir.path(), &req).unwrap();
        assert_eq!(created.name, "Planet");
        assert!(!created.id.is_empty());

        let templates = load(dir.path()).unwrap();
        assert_eq!(templates.len(), 6);
        assert!(templates.iter().any(|t| t.name == "Planet"));
    }

    #[test]
    fn update_modifies_an_existing_template() {
        let dir = tempdir().unwrap();
        let templates = load(dir.path()).unwrap();
        let character = templates.iter().find(|t| t.name == "Character").unwrap().clone();

        let req = UpdateEntityTemplateRequest {
            name: Some("Protagonist".to_string()),
            name_plural: None,
            color: None,
            fields: None,
        };
        let updated = update(dir.path(), &character.id, &req).unwrap();
        assert_eq!(updated.name, "Protagonist");
        assert_eq!(updated.color, character.color); // unchanged field preserved

        let after = load(dir.path()).unwrap();
        assert!(after.iter().any(|t| t.name == "Protagonist"));
        assert!(!after.iter().any(|t| t.name == "Character"));
    }

    #[test]
    fn update_missing_id_errors() {
        let dir = tempdir().unwrap();
        load(dir.path()).unwrap();
        let req = UpdateEntityTemplateRequest {
            name: Some("X".to_string()),
            name_plural: None,
            color: None,
            fields: None,
        };
        let result = update(dir.path(), "does-not-exist", &req);
        assert!(matches!(result, Err(InkwellError::NotFound(_))));
    }

    #[test]
    fn delete_removes_a_builtin_template() {
        let dir = tempdir().unwrap();
        let templates = load(dir.path()).unwrap();
        let character = templates.iter().find(|t| t.name == "Character").unwrap().clone();
        delete(dir.path(), &character.id).unwrap();
        let after = load(dir.path()).unwrap();
        assert_eq!(after.len(), 4);
        assert!(!after.iter().any(|t| t.name == "Character"));
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --lib entity_templates`
Expected: FAIL (`todo!()` panics — every function is unimplemented).

- [ ] **Step 5: Implement storage functions and the built-in seed data**

Replace the `todo!()` bodies in `src-tauri/src/db/entity_templates.rs` with:

```rust
pub fn load(app_data_dir: &Path) -> Result<Vec<EntityTemplate>> {
    let path = templates_path(app_data_dir);
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let defaults = builtin_defaults();
            save(app_data_dir, &defaults)?;
            return Ok(defaults);
        }
        Err(e) => return Err(e.into()),
    };
    if content.trim().is_empty() {
        return Ok(vec![]);
    }
    let templates: Vec<EntityTemplate> = serde_json::from_str(&content)?;
    Ok(templates)
}

fn save(app_data_dir: &Path, templates: &[EntityTemplate]) -> Result<()> {
    fs::create_dir_all(app_data_dir)?;
    let path = templates_path(app_data_dir);
    let tmp_path = app_data_dir.join("entity_templates.json.tmp");
    let json = serde_json::to_string_pretty(templates)?;
    fs::write(&tmp_path, json)?;
    fs::rename(&tmp_path, &path)?;
    Ok(())
}

pub fn create(app_data_dir: &Path, req: &CreateEntityTemplateRequest) -> Result<EntityTemplate> {
    let mut templates = load(app_data_dir)?;
    let template = EntityTemplate {
        id: ulid::Ulid::new().to_string(),
        name: req.name.clone(),
        name_plural: req.name_plural.clone(),
        color: req.color.clone(),
        fields: req.fields.clone(),
    };
    templates.push(template.clone());
    save(app_data_dir, &templates)?;
    Ok(template)
}

pub fn update(
    app_data_dir: &Path,
    id: &str,
    req: &UpdateEntityTemplateRequest,
) -> Result<EntityTemplate> {
    let mut templates = load(app_data_dir)?;
    let idx = templates
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| InkwellError::NotFound(format!("EntityTemplate '{id}' not found")))?;

    let current = templates[idx].clone();
    let updated = EntityTemplate {
        id: current.id,
        name: req.name.clone().unwrap_or(current.name),
        name_plural: req.name_plural.clone().unwrap_or(current.name_plural),
        color: req.color.clone().unwrap_or(current.color),
        fields: req.fields.clone().unwrap_or(current.fields),
    };
    templates[idx] = updated.clone();
    save(app_data_dir, &templates)?;
    Ok(updated)
}

pub fn delete(app_data_dir: &Path, id: &str) -> Result<()> {
    let mut templates = load(app_data_dir)?;
    templates.retain(|t| t.id != id);
    save(app_data_dir, &templates)
}

fn field(name: &str, label: &str, field_type: &str) -> DefaultField {
    DefaultField {
        name: name.to_string(),
        label: label.to_string(),
        field_type: field_type.to_string(),
        options: None,
        default_value: None,
    }
}

fn field_with_options(name: &str, label: &str, field_type: &str, options: &str) -> DefaultField {
    DefaultField {
        name: name.to_string(),
        label: label.to_string(),
        field_type: field_type.to_string(),
        options: Some(options.to_string()),
        default_value: None,
    }
}

fn field_with_default(name: &str, label: &str, field_type: &str, default_value: &str) -> DefaultField {
    DefaultField {
        name: name.to_string(),
        label: label.to_string(),
        field_type: field_type.to_string(),
        options: None,
        default_value: Some(default_value.to_string()),
    }
}

fn builtin_defaults() -> Vec<EntityTemplate> {
    vec![
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Character".to_string(),
            name_plural: "Characters".to_string(),
            color: "#8B6FE8".to_string(),
            fields: vec![
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
                field_with_default("alive", "Alive", "boolean", "true"),
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Location".to_string(),
            name_plural: "Locations".to_string(),
            color: "#4EA86B".to_string(),
            fields: vec![
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
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Item".to_string(),
            name_plural: "Items".to_string(),
            color: "#E8883A".to_string(),
            fields: vec![
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
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Event".to_string(),
            name_plural: "Events".to_string(),
            color: "#4A9FD4".to_string(),
            fields: vec![
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
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Organization".to_string(),
            name_plural: "Organizations".to_string(),
            color: "#D44A7A".to_string(),
            fields: vec![
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
            ],
        },
    ]
}
```

- [ ] **Step 6: Register the db module**

Run: `grep -n "pub mod" src-tauri/src/db/mod.rs`
Add `pub mod entity_templates;` matching the existing style/ordering (alphabetical, alongside `document_repo`, `entity_asset_repo`, etc.).

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib entity_templates`
Expected: PASS (5 tests).

- [ ] **Step 8: Run clippy and fmt**

Run: `cd src-tauri && cargo clippy -- -D warnings && cargo fmt -- --check`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/models/entity_template.rs src-tauri/src/db/entity_templates.rs src-tauri/src/models/mod.rs src-tauri/src/db/mod.rs
git commit -m "Add application-level entity template storage"
```

---

## Task 2: Core entity-creation rework — `models/entity.rs`, `entity_type_repo.rs`, `entity_repo.rs`

This is one task because Rust requires the whole crate to compile at every commit: renaming `CreateEntityRequest.entity_type_id` to `entity_type_name` and changing `entity_repo::create`'s signature cannot be split across commits without an intermediate broken build. Also deletes `default_properties.rs`, which becomes fully unused the moment `entity_repo.rs` stops importing it.

**Files:**
- Modify: `src-tauri/src/models/entity.rs`
- Modify: `src-tauri/src/db/entity_type_repo.rs`
- Modify: `src-tauri/src/db/entity_repo.rs`
- Delete: `src-tauri/src/db/default_properties.rs`
- Modify: `src-tauri/src/db/mod.rs` (remove `pub mod default_properties;`)

**Interfaces:**
- Consumes: `models::entity_template::EntityTemplate`/`DefaultField` (Task 1).
- Produces: `CreateEntityRequest { entity_type_name: String, .. }`, `entity_type_repo::get_or_create_by_name(conn, project_id, name, name_plural, color) -> Result<EntityType>`, `entity_repo::create(conn, project_id, &req, templates: &[EntityTemplate]) -> Result<Entity>`. Task 3 (`commands/entities.rs`) consumes the new `create` signature.

- [ ] **Step 1: Update the model**

In `src-tauri/src/models/entity.rs`, replace:

```rust
pub struct CreateEntityRequest {
    pub entity_type_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
    pub folder_id: Option<String>,
}
```

with:

```rust
pub struct CreateEntityRequest {
    pub entity_type_name: String,
    pub name: String,
    pub summary: Option<String>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
    pub folder_id: Option<String>,
}
```

The `Entity` struct itself is unchanged — `entity_type_id: String` there still refers to the project-local `entity_types.id` foreign key, which still exists and works exactly as today.

- [ ] **Step 2: Add `get_or_create_by_name` and delete `seed_defaults` in `entity_type_repo.rs`**

In `src-tauri/src/db/entity_type_repo.rs`, replace the entire `seed_defaults` function (currently lines 119-159) with:

```rust
/// Returns the project's existing entity_type row for this name, or creates
/// one (using the given plural/color as the initial values) if this project
/// has never used this name before. This is the ONLY place a project's
/// entity_types table gains a new row — called once, at entity-creation time.
pub fn get_or_create_by_name(
    conn: &Connection,
    project_id: &str,
    name: &str,
    name_plural: &str,
    color: &str,
) -> Result<EntityType> {
    let existing = list(conn, project_id)?;
    if let Some(found) = existing.iter().find(|t| t.name == name) {
        return Ok(found.clone());
    }
    let next_sort_order = existing
        .iter()
        .map(|t| t.sort_order)
        .max()
        .map(|m| m + 1)
        .unwrap_or(0);
    create(
        conn,
        project_id,
        &CreateEntityTypeRequest {
            name: name.to_string(),
            name_plural: Some(name_plural.to_string()),
            icon: None,
            color: Some(color.to_string()),
            description: None,
            sort_order: Some(next_sort_order),
        },
    )
}
```

- [ ] **Step 3: Remove `seed_defaults`'s tests from `entity_type_repo.rs`**

In the `#[cfg(test)] mod tests` block, delete these 5 test functions entirely (they tested the now-removed `seed_defaults`): `seed_defaults_creates_six_types`, `seed_defaults_is_idempotent`, `seed_defaults_assigns_sort_order_in_order`, `seed_defaults_adds_missing_defaults_alongside_a_custom_type`, `seed_defaults_adds_only_missing_types_to_an_existing_project`. Also remove the now-unused `use crate::db::field_definition_repo;` from the test module's imports (it was only used inside `seed_defaults_adds_only_missing_types_to_an_existing_project`).

All other tests (`create_and_get`, `list_returns_active_only`, `update_partial`, `soft_delete`, `cannot_delete_system_type`) are unaffected and stay as they are.

- [ ] **Step 4: Write the failing tests for `get_or_create_by_name`**

Add to the same test module:

```rust
    #[test]
    fn get_or_create_by_name_creates_when_missing() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let created = get_or_create_by_name(&conn, &pid, "Planet", "Planets", "#00FFAA").unwrap();
        assert_eq!(created.name, "Planet");
        assert_eq!(created.name_plural.as_deref(), Some("Planets"));
        assert_eq!(created.color.as_deref(), Some("#00FFAA"));
        assert_eq!(created.sort_order, 0);

        let types = list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 1);
    }

    #[test]
    fn get_or_create_by_name_reuses_existing_row_unchanged() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        let original = create(
            &conn,
            &pid,
            &CreateEntityTypeRequest {
                name: "Character".into(),
                name_plural: Some("Characters".into()),
                icon: None,
                color: Some("#8B6FE8".into()),
                description: None,
                sort_order: Some(0),
            },
        )
        .unwrap();

        // Different plural/color passed here must be ignored — the existing
        // row must come back completely unchanged.
        let found = get_or_create_by_name(&conn, &pid, "Character", "Different Plural", "#FFFFFF").unwrap();
        assert_eq!(found.id, original.id);
        assert_eq!(found.name_plural.as_deref(), Some("Characters"));
        assert_eq!(found.color.as_deref(), Some("#8B6FE8"));

        let types = list(&conn, &pid).unwrap();
        assert_eq!(types.len(), 1);
    }

    #[test]
    fn get_or_create_by_name_assigns_next_sort_order() {
        let conn = test_conn();
        let pid = seed_project(&conn);
        get_or_create_by_name(&conn, &pid, "Character", "Characters", "#8B6FE8").unwrap();
        let second = get_or_create_by_name(&conn, &pid, "Location", "Locations", "#4EA86B").unwrap();
        assert_eq!(second.sort_order, 1);
    }
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --lib entity_type_repo`
Expected: compile error (`get_or_create_by_name` doesn't exist yet) until Step 2 above is also in place — if you're following these steps in order, Step 2 already added it, so these should PASS immediately. Run this to confirm PASS (3 new tests) plus the retained tests all still pass.

- [ ] **Step 6: Rewrite `entity_repo.rs::create` and its imports**

Replace the top imports:

```rust
use crate::db::{default_properties, entity_type_repo, field_definition_repo};
use crate::error::{InkwellError, Result};
use crate::models::entity::{CreateEntityRequest, Entity, UpdateEntityRequest};
use crate::models::field_definition::CreateFieldDefinitionRequest;
```

with:

```rust
use crate::db::{entity_type_repo, field_definition_repo};
use crate::error::{InkwellError, Result};
use crate::models::entity::{CreateEntityRequest, Entity, UpdateEntityRequest};
use crate::models::entity_template::EntityTemplate;
use crate::models::field_definition::CreateFieldDefinitionRequest;
```

Replace the entire `create` function body with:

```rust
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

    let entity_type = entity_type_repo::get_or_create_by_name(
        conn,
        project_id,
        &req.entity_type_name,
        name_plural,
        color,
    )?;

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
            field_definition_repo::list_by_entity_type(conn, &entity_type.id)?
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
                conn,
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

    get(conn, &id)
}
```

Note this removes the old "verify the entity_type exists and belongs to this project" validation block entirely — `get_or_create_by_name` now guarantees a valid, project-scoped entity type unconditionally, so that check is no longer meaningful (any name succeeds by design).

- [ ] **Step 7: Rewrite the test module**

Replace the entire `#[cfg(test)] mod tests` block in `entity_repo.rs` with:

```rust
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
                DefaultField { name: "birth_date".into(), label: "Birth Date".into(), field_type: "date".into(), options: None, default_value: None },
                DefaultField { name: "height".into(), label: "Height".into(), field_type: "number".into(), options: Some(r#"{"unit":"cm"}"#.into()), default_value: None },
                DefaultField { name: "eye_color".into(), label: "Eye Color".into(), field_type: "select".into(), options: Some(r#"["Brown","Blue","Green","Hazel","Gray","Amber","Other"]"#.into()), default_value: None },
                DefaultField { name: "occupation".into(), label: "Occupation".into(), field_type: "text".into(), options: None, default_value: None },
                DefaultField { name: "personality".into(), label: "Personality".into(), field_type: "textarea".into(), options: None, default_value: None },
                DefaultField { name: "alive".into(), label: "Alive".into(), field_type: "boolean".into(), options: None, default_value: Some("true".into()) },
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
        let blank_entity = create(&conn, &pid, &make_entity("Entity", "Something"), &templates).unwrap();
        let custom_entity = create(&conn, &pid, &make_entity("MyCustomType", "Something Else"), &templates).unwrap();

        assert!(field_definition_repo::list_by_entity(&conn, &blank_entity.id).unwrap().is_empty());
        assert!(field_definition_repo::list_by_entity(&conn, &custom_entity.id).unwrap().is_empty());
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
```

Note: `invalid_entity_type_rejected` (the old test asserting an unrecognized type id is rejected) is intentionally gone — under this design any type name lazily succeeds; that's exactly what `create_lazily_creates_entity_type_for_a_new_name` now proves instead.

- [ ] **Step 8: Delete `default_properties.rs` and unregister it**

```bash
rm src-tauri/src/db/default_properties.rs
```

In `src-tauri/src/db/mod.rs`, remove the line `pub mod default_properties;`.

- [ ] **Step 9: Run the full backend test suite**

Run: `cd src-tauri && cargo test`
Expected: PASS. This is the checkpoint where the whole crate compiles and the core rework is fully wired together, before touching commands.

- [ ] **Step 10: Run clippy and fmt**

Run: `cd src-tauri && cargo clippy -- -D warnings && cargo fmt -- --check`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/models/entity.rs src-tauri/src/db/entity_type_repo.rs src-tauri/src/db/entity_repo.rs src-tauri/src/db/mod.rs
git rm src-tauri/src/db/default_properties.rs
git commit -m "Entities are created by type name; entity_types populate lazily"
```

---

## Task 3: `commands/entities.rs::create_entity` — wire up templates

**Files:**
- Modify: `src-tauri/src/commands/entities.rs`

**Interfaces:**
- Consumes: `entity_templates::load` (Task 1), `entity_repo::create(conn, project_id, &req, &templates)` (Task 2).
- Produces: no change to the Tauri command's name or its frontend-facing parameter shape beyond the `req` body already changing in Task 2's model (`entity_type_name` instead of `entity_type_id`) — the command gains an `app: tauri::AppHandle` parameter, which Tauri auto-injects; the frontend invoke call passes no new argument for it.

- [ ] **Step 1: Update the command**

Replace the top of `src-tauri/src/commands/entities.rs`:

```rust
use tauri::State;

use crate::db::entity_repo;
use crate::error::{InkwellError, Result};
use crate::models::entity::{CreateEntityRequest, Entity, UpdateEntityRequest};
use crate::state::AppState;
```

with:

```rust
use tauri::{Manager, State};

use crate::db::{entity_repo, entity_templates};
use crate::error::{InkwellError, Result};
use crate::models::entity::{CreateEntityRequest, Entity, UpdateEntityRequest};
use crate::state::AppState;
```

Replace `create_entity`:

```rust
#[tauri::command]
pub async fn create_entity(
    state: State<'_, AppState>,
    project_id: String,
    req: CreateEntityRequest,
) -> Result<Entity> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Entity name cannot be empty".into(),
        ));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::create(&conn, &project_id, &req)
}
```

with:

```rust
#[tauri::command]
pub async fn create_entity(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    req: CreateEntityRequest,
) -> Result<Entity> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Entity name cannot be empty".into(),
        ));
    }
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string()))
    })?;
    let templates = entity_templates::load(&app_data_dir)?;
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    entity_repo::create(&conn, &project_id, &req, &templates)
}
```

Every other command in this file (`get_entity`, `list_entities`, etc.) is unchanged.

- [ ] **Step 2: Verify the crate compiles**

Run: `cd src-tauri && cargo build`
Expected: no errors. There are no Rust unit tests for Tauri command wrappers in this codebase (thin pass-throughs, already covered by `entity_repo`'s own tests) — `cargo build` succeeding is the verification for this task.

- [ ] **Step 3: Run the full backend suite**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt -- --check`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/entities.rs
git commit -m "create_entity loads app-level templates before creating an entity"
```

---

## Task 4: `commands/projects.rs` — remove `seed_defaults` call sites

**Files:**
- Modify: `src-tauri/src/commands/projects.rs`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — purely removes two now-invalid calls (the function they called no longer exists after Task 2).

- [ ] **Step 1: Remove the two call sites**

In `create_project`, remove this line:

```rust
    crate::db::entity_type_repo::seed_defaults(&new_conn, &project_id)?;
```

In `open_project`, remove this line:

```rust
    crate::db::entity_type_repo::seed_defaults(&new_conn, &project_id)?;
```

Nothing replaces them — a brand-new project now simply starts with zero `entity_types` rows, populated lazily the first time an entity is created.

- [ ] **Step 2: Verify the crate compiles**

Run: `cd src-tauri && cargo build`
Expected: no errors (this file has no dedicated unit tests — it's exercised via the frontend/manual flow; `cargo test` in the next step covers the rest of the crate).

- [ ] **Step 3: Run the full backend suite**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt -- --check`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/projects.rs
git commit -m "Stop pre-seeding entity_types on project create/open"
```

---

## Task 5: `commands/entity_templates.rs` + `lib.rs` registration

**Files:**
- Create: `src-tauri/src/commands/entity_templates.rs`
- Modify: `src-tauri/src/commands/mod.rs` (register module — read it first to match its existing style)
- Modify: `src-tauri/src/lib.rs` (register the 4 new commands)

**Interfaces:**
- Consumes: `entity_templates::{load, create, update, delete}` (Task 1).
- Produces: Tauri commands `list_entity_templates`, `create_entity_template`, `update_entity_template`, `delete_entity_template`. Task 8 (frontend `useTauri.ts`) consumes these exact command name strings.

- [ ] **Step 1: Check the command module registration style**

Run: `grep -n "pub mod" src-tauri/src/commands/mod.rs`
Use whatever style is already there for the new line.

- [ ] **Step 2: Write the command file**

Create `src-tauri/src/commands/entity_templates.rs`:

```rust
use tauri::Manager;

use crate::db::entity_templates;
use crate::error::{InkwellError, Result};
use crate::models::entity_template::{
    CreateEntityTemplateRequest, EntityTemplate, UpdateEntityTemplateRequest,
};

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    app.path().app_data_dir().map_err(|e| {
        InkwellError::Filesystem(std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string()))
    })
}

#[tauri::command]
pub async fn list_entity_templates(app: tauri::AppHandle) -> Result<Vec<EntityTemplate>> {
    entity_templates::load(&app_data_dir(&app)?)
}

#[tauri::command]
pub async fn create_entity_template(
    app: tauri::AppHandle,
    req: CreateEntityTemplateRequest,
) -> Result<EntityTemplate> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Entity type name cannot be empty".into(),
        ));
    }
    entity_templates::create(&app_data_dir(&app)?, &req)
}

#[tauri::command]
pub async fn update_entity_template(
    app: tauri::AppHandle,
    id: String,
    req: UpdateEntityTemplateRequest,
) -> Result<EntityTemplate> {
    if let Some(ref name) = req.name {
        if name.trim().is_empty() {
            return Err(InkwellError::Validation(
                "Entity type name cannot be empty".into(),
            ));
        }
    }
    entity_templates::update(&app_data_dir(&app)?, &id, &req)
}

#[tauri::command]
pub async fn delete_entity_template(app: tauri::AppHandle, id: String) -> Result<()> {
    entity_templates::delete(&app_data_dir(&app)?, &id)
}
```

- [ ] **Step 3: Register the command module and the 4 commands**

Add `pub mod entity_templates;` to `src-tauri/src/commands/mod.rs`, matching the existing style.

In `src-tauri/src/lib.rs`, add a new group after the `// Entity types` group:

```rust
            // Entity templates (application-level)
            commands::entity_templates::list_entity_templates,
            commands::entity_templates::create_entity_template,
            commands::entity_templates::update_entity_template,
            commands::entity_templates::delete_entity_template,
```

- [ ] **Step 4: Verify the crate compiles**

Run: `cd src-tauri && cargo build`
Expected: no errors.

- [ ] **Step 5: Run the full backend suite**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt -- --check`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/entity_templates.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "Add entity template CRUD commands"
```

---

## Task 6: Frontend types — `core.ts`

**Files:**
- Modify: `src/types/core.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DefaultField`, `EntityTemplate` types. Tasks 7-11 consume these.

- [ ] **Step 1: Add the types**

In `src/types/core.ts`, after the `EntityType` interface, add:

```typescript
export interface DefaultField {
  name: string;
  label: string;
  field_type: FieldType;
  options: string | null;
  default_value: string | null;
}

export interface EntityTemplate {
  id: string;
  name: string;
  name_plural: string;
  color: string;
  fields: DefaultField[];
}
```

(`FieldType` is already defined further down in this file — TypeScript doesn't require declaration order within a module, so this is fine as-is.)

- [ ] **Step 2: Commit**

```bash
git add src/types/core.ts
git commit -m "Add DefaultField and EntityTemplate frontend types"
```

---

## Task 7: Frontend hooks — `useTauri.ts`

**Files:**
- Modify: `src/hooks/useTauri.ts`

**Interfaces:**
- Consumes: Tauri commands `list_entity_templates`, `create_entity_template`, `update_entity_template`, `delete_entity_template` (Task 5), `create_entity` with the new `entity_type_name` request shape (Task 2/3).
- Produces: `invokeListEntityTemplates()`, `invokeCreateEntityTemplate(req)`, `invokeUpdateEntityTemplate(id, req)`, `invokeDeleteEntityTemplate(id)`, updated `invokeCreateEntity`. Tasks 10-11 consume these exact names.

- [ ] **Step 1: Update the type import**

Replace:

```typescript
import type { Document, Entity, EntityAsset, EntityFolder, EntityType, FieldDefinition, FieldValue, InitResult, KnownProject, OpenProjectResult, Relation, RelationType, ProjectStats } from "../types/core";
```

with:

```typescript
import type { Document, DefaultField, Entity, EntityAsset, EntityFolder, EntityTemplate, EntityType, FieldDefinition, FieldValue, InitResult, KnownProject, OpenProjectResult, Relation, RelationType, ProjectStats } from "../types/core";
```

- [ ] **Step 2: Update `invokeCreateEntity` and add the 4 new wrappers**

Replace:

```typescript
export async function invokeCreateEntity(projectId: string, req: { entity_type_id: string; name: string; folder_id?: string | null }): Promise<Entity> { return invoke<Entity>("create_entity", { projectId, req }); }
```

with:

```typescript
export async function invokeCreateEntity(projectId: string, req: { entity_type_name: string; name: string; folder_id?: string | null }): Promise<Entity> { return invoke<Entity>("create_entity", { projectId, req }); }
```

Add, near `invokeListEntityTypes`:

```typescript
export async function invokeListEntityTemplates(): Promise<EntityTemplate[]> { return invoke<EntityTemplate[]>("list_entity_templates"); }
export async function invokeCreateEntityTemplate(req: { name: string; name_plural: string; color: string; fields: DefaultField[] }): Promise<EntityTemplate> { return invoke<EntityTemplate>("create_entity_template", { req }); }
export async function invokeUpdateEntityTemplate(id: string, req: { name?: string; name_plural?: string; color?: string; fields?: DefaultField[] }): Promise<EntityTemplate> { return invoke<EntityTemplate>("update_entity_template", { id, req }); }
export async function invokeDeleteEntityTemplate(id: string): Promise<void> { return invoke("delete_entity_template", { id }); }
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useTauri.ts
git commit -m "Add entity template invoke wrappers; create_entity takes entity_type_name"
```

(No test run here — `useTauri.ts` has no dedicated test file in this codebase, per established convention; it's exercised through the component tests in later tasks.)

---

## Task 8: Frontend store — `appStore.ts`

**Files:**
- Modify: `src/store/appStore.ts`

**Interfaces:**
- Consumes: `EntityTemplate` type (Task 6).
- Produces: `entityTemplates: EntityTemplate[]`, `setEntityTemplates: (v: EntityTemplate[]) => void`. Tasks 10-11 consume these. **Not** cleared by `resetProjectState` — this is app-level, not project data.

- [ ] **Step 1: Add the type import**

In `src/store/appStore.ts`, replace:

```typescript
import type { Document, Entity, EntityFolder, EntityType, FieldDefinition, KnownProject, RelationType } from "../types/core";
```

with:

```typescript
import type { Document, Entity, EntityFolder, EntityTemplate, EntityType, FieldDefinition, KnownProject, RelationType } from "../types/core";
```

- [ ] **Step 2: Add the state field and setter to the `AppState` interface**

Find, in the `interface AppState { ... }` line:

```typescript
knownProjects:KnownProject[];
```

Change it to:

```typescript
knownProjects:KnownProject[]; entityTemplates:EntityTemplate[];
```

Find:

```typescript
setKnownProjects:(v:KnownProject[])=>void;
```

Change it to:

```typescript
setKnownProjects:(v:KnownProject[])=>void; setEntityTemplates:(v:EntityTemplate[])=>void;
```

- [ ] **Step 3: Add the default value**

Find, in the store's initial state object:

```typescript
knownProjects:[],
```

Change it to:

```typescript
knownProjects:[],entityTemplates:[],
```

- [ ] **Step 4: Add the setter**

Find:

```typescript
setKnownProjects:v=>set({knownProjects:v}),
```

Change it to:

```typescript
setKnownProjects:v=>set({knownProjects:v}),setEntityTemplates:v=>set({entityTemplates:v}),
```

Do **not** add `entityTemplates` to `resetProjectState`'s object literal — leaving it out is exactly what makes it survive project switches. This is the one thing to double check before committing.

- [ ] **Step 5: Verify the file still parses**

Run: `npx tsc --noEmit 2>&1 | grep appStore`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/store/appStore.ts
git commit -m "Add entityTemplates slice to the app store (app-level, survives resetProjectState)"
```

---

## Task 9: `SplashPage.tsx` — load templates on startup

**Files:**
- Modify: `src/pages/SplashPage.tsx`

**Interfaces:**
- Consumes: `invokeListEntityTemplates` (Task 7), `setEntityTemplates` (Task 8).
- Produces: nothing new consumed elsewhere — this just populates the store before the rest of the app renders, exactly like `knownProjects` already does.

- [ ] **Step 1: Update the import and init flow**

Replace:

```typescript
import { invokeInitializeCore, invokeListKnownProjects } from "../hooks/useTauri";
```

with:

```typescript
import { invokeInitializeCore, invokeListKnownProjects, invokeListEntityTemplates } from "../hooks/useTauri";
```

Replace:

```typescript
  const {
    initStatus, initError,
    setCoreInitialized, setInitStatus, setInitError, setKnownProjects,
  } = useAppStore();
```

with:

```typescript
  const {
    initStatus, initError,
    setCoreInitialized, setInitStatus, setInitError, setKnownProjects, setEntityTemplates,
  } = useAppStore();
```

Replace:

```typescript
        if (result.ok) {
          const projects = await invokeListKnownProjects();
          if (cancelled) return;
          setKnownProjects(projects);
          setCoreInitialized(true);
        } else {
```

with:

```typescript
        if (result.ok) {
          const projects = await invokeListKnownProjects();
          if (cancelled) return;
          setKnownProjects(projects);
          const templates = await invokeListEntityTemplates();
          if (cancelled) return;
          setEntityTemplates(templates);
          setCoreInitialized(true);
        } else {
```

- [ ] **Step 2: Run the frontend suite to confirm no regression**

Run: `npx vitest run src/pages`
Expected: PASS (no existing test for `SplashPage.tsx` asserts against this exact sequence, but confirm nothing else in `src/pages` broke).

- [ ] **Step 3: Commit**

```bash
git add src/pages/SplashPage.tsx
git commit -m "Load entity templates on app startup"
```

---

## Task 10: `CreateEntityModal.tsx` + new test — switch to template-driven picker

**Files:**
- Modify: `src/components/CreateEntityModal.tsx`
- Create: `src/components/CreateEntityModal.test.tsx` (no test file exists for this component today)

**Interfaces:**
- Consumes: `entityTemplates` from the store (Task 8), `invokeCreateEntity` with `entity_type_name` (Task 7).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

Create `src/components/CreateEntityModal.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CreateEntityModal } from "./CreateEntityModal";
import { useAppStore } from "../store/appStore";
import type { EntityTemplate } from "../types/core";

vi.mock("../hooks/useTauri", () => ({
  invokeCreateEntity: vi.fn(),
  invokeCreateEntityFolder: vi.fn(),
}));

import { invokeCreateEntity, invokeCreateEntityFolder } from "../hooks/useTauri";

const mockCreateEntity = invokeCreateEntity as ReturnType<typeof vi.fn>;
const mockCreateEntityFolder = invokeCreateEntityFolder as ReturnType<typeof vi.fn>;

function makeTemplate(overrides: Partial<EntityTemplate> = {}): EntityTemplate {
  return {
    id: "tmpl1",
    name: "Character",
    name_plural: "Characters",
    color: "#8B6FE8",
    fields: [],
    ...overrides,
  };
}

function resetStore() {
  useAppStore.setState({
    projectId: "p1",
    showCreateEntityModal: true,
    entityTemplates: [makeTemplate()],
    rootEntities: [],
    entityFolders: [],
  });
}

describe("CreateEntityModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("renders a button per app-level template, not per project entity type", () => {
    render(<CreateEntityModal />);
    expect(screen.getByRole("button", { name: /character/i })).toBeInTheDocument();
  });

  it("creates an entity by template name when a template button is clicked", async () => {
    const user = userEvent.setup();
    mockCreateEntity.mockResolvedValue({
      id: "e1", project_id: "p1", entity_type_id: "et1", name: "New Entity",
      summary: null, cover_image: null, visibility: "private", sort_order: 0,
      folder_id: null, created_at: "2026-01-01", updated_at: "2026-01-01", deleted_at: null,
    });
    render(<CreateEntityModal />);

    await user.click(screen.getByRole("button", { name: /character/i }));

    expect(mockCreateEntity).toHaveBeenCalledWith("p1", {
      entity_type_name: "Character",
      name: "New Entity",
    });
    expect(useAppStore.getState().rootEntities).toHaveLength(1);
    expect(useAppStore.getState().showCreateEntityModal).toBe(false);
  });

  it("still creates a folder via the Folder button", async () => {
    const user = userEvent.setup();
    mockCreateEntityFolder.mockResolvedValue({
      id: "f1", project_id: "p1", name: "New Folder", sort_order: 0,
      created_at: "2026-01-01", deleted_at: null,
    });
    render(<CreateEntityModal />);

    await user.click(screen.getByRole("button", { name: /folder/i }));

    expect(mockCreateEntityFolder).toHaveBeenCalledWith("p1", { name: "New Folder" });
    expect(useAppStore.getState().entityFolders).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/CreateEntityModal.test.tsx`
Expected: FAIL — the component still reads `entityTypes` and sends `entity_type_id`, so no "Character" button renders from `entityTemplates` and the invoke payload assertion fails.

- [ ] **Step 3: Update the component**

Replace the store destructuring:

```typescript
  const {
    showCreateEntityModal,
    setShowCreateEntityModal,
    projectId,
    entityTypes,
    rootEntities,
    setRootEntities,
    entityFolders,
    setEntityFolders,
    setSelectedEntityId,
  } = useAppStore();
```

with:

```typescript
  const {
    showCreateEntityModal,
    setShowCreateEntityModal,
    projectId,
    entityTemplates,
    rootEntities,
    setRootEntities,
    entityFolders,
    setEntityFolders,
    setSelectedEntityId,
  } = useAppStore();
```

Replace `createEntity`:

```typescript
  async function createEntity(entityTypeId: string) {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const entity = await invokeCreateEntity(projectId, {
        entity_type_id: entityTypeId,
        name: "New Entity",
      });
      setRootEntities([...rootEntities, entity]);
      setSelectedEntityId(entity.id);
      setShowCreateEntityModal(false);
    } finally {
      setCreating(false);
    }
  }
```

with:

```typescript
  async function createEntity(entityTypeName: string) {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const entity = await invokeCreateEntity(projectId, {
        entity_type_name: entityTypeName,
        name: "New Entity",
      });
      setRootEntities([...rootEntities, entity]);
      setSelectedEntityId(entity.id);
      setShowCreateEntityModal(false);
    } finally {
      setCreating(false);
    }
  }
```

Replace the picker button list:

```typescript
            {entityTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => void createEntity(type.id)}
                disabled={creating}
                className="w-full flex items-center justify-between px-3 py-2 rounded border hover:opacity-90 transition-all group font-mono text-xs uppercase tracking-wider disabled:opacity-50"
                style={{
                  borderColor: type.color ?? "#c9a84c",
                  color: type.color ?? "#c9a84c",
                  backgroundColor: `${type.color ?? "#c9a84c"}22`,
                }}
              >
                <span>{type.name}</span>
                <Plus size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
```

with:

```typescript
            {entityTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => void createEntity(template.name)}
                disabled={creating}
                className="w-full flex items-center justify-between px-3 py-2 rounded border hover:opacity-90 transition-all group font-mono text-xs uppercase tracking-wider disabled:opacity-50"
                style={{
                  borderColor: template.color,
                  color: template.color,
                  backgroundColor: `${template.color}22`,
                }}
              >
                <span>{template.name}</span>
                <Plus size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/CreateEntityModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CreateEntityModal.tsx src/components/CreateEntityModal.test.tsx
git commit -m "CreateEntityModal: pick from app-level templates, not project entity types"
```

---

## Task 11: `EntityTypeEditor.tsx` + test — the Entity Editor UI

**Files:**
- Create: `src/components/EntityTypeEditor.tsx`
- Create: `src/components/EntityTypeEditor.test.tsx`

**Interfaces:**
- Consumes: `entityTemplates`/`setEntityTemplates` (Task 8), `invokeCreateEntityTemplate`/`invokeUpdateEntityTemplate`/`invokeDeleteEntityTemplate` (Task 7), `ConfirmDialog` (existing component, `src/components/ConfirmDialog.tsx`).
- Produces: `EntityTypeEditor` component, consumed by Task 12 (`SettingsScreen.tsx`).

Allowed field types for a template's default properties are intentionally a subset of the full property-editor's list: `text`, `textarea`, `number`, `date`, `select`, `boolean` — not `image`, `entity_ref`, or `multiselect`, since those either don't make sense as a *default* (image) or reference another *project-specific* entity type that doesn't exist at the application level (`entity_ref`/`multiselect`). This matches exactly what all 5 built-in templates already use.

- [ ] **Step 1: Write the failing tests**

Create `src/components/EntityTypeEditor.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EntityTypeEditor } from "./EntityTypeEditor";
import { useAppStore } from "../store/appStore";
import type { EntityTemplate } from "../types/core";

vi.mock("../hooks/useTauri", () => ({
  invokeCreateEntityTemplate: vi.fn(),
  invokeUpdateEntityTemplate: vi.fn(),
  invokeDeleteEntityTemplate: vi.fn(),
}));

import {
  invokeCreateEntityTemplate,
  invokeUpdateEntityTemplate,
  invokeDeleteEntityTemplate,
} from "../hooks/useTauri";

const mockCreate = invokeCreateEntityTemplate as ReturnType<typeof vi.fn>;
const mockUpdate = invokeUpdateEntityTemplate as ReturnType<typeof vi.fn>;
const mockDelete = invokeDeleteEntityTemplate as ReturnType<typeof vi.fn>;

function makeTemplate(overrides: Partial<EntityTemplate> = {}): EntityTemplate {
  return {
    id: "tmpl1",
    name: "Character",
    name_plural: "Characters",
    color: "#8B6FE8",
    fields: [
      { name: "birth_date", label: "Birth Date", field_type: "date", options: null, default_value: null },
    ],
    ...overrides,
  };
}

function resetStore(templates: EntityTemplate[] = [makeTemplate()]) {
  useAppStore.setState({ entityTemplates: templates });
}

describe("EntityTypeEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("lists existing templates with their property count", () => {
    render(<EntityTypeEditor />);
    expect(screen.getByText("Character")).toBeInTheDocument();
    expect(screen.getByText(/1 propert/i)).toBeInTheDocument();
  });

  it("creates a new template", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeTemplate({ id: "tmpl2", name: "Planet", name_plural: "Planets", color: "#00FFAA", fields: [] }));
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /add entity type/i }));
    await user.type(screen.getByPlaceholderText(/^name$/i), "Planet");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Planet" })
      );
    });
    await waitFor(() => {
      expect(useAppStore.getState().entityTemplates).toHaveLength(2);
    });
  });

  it("edits an existing template", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(makeTemplate({ name: "Protagonist" }));
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /edit character/i }));
    const nameInput = screen.getByPlaceholderText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Protagonist");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("tmpl1", expect.objectContaining({ name: "Protagonist" }));
    });
    await waitFor(() => {
      expect(useAppStore.getState().entityTemplates[0].name).toBe("Protagonist");
    });
  });

  it("deletes a template after confirming", async () => {
    const user = userEvent.setup();
    mockDelete.mockResolvedValue(undefined);
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /delete character/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("tmpl1");
    });
    await waitFor(() => {
      expect(useAppStore.getState().entityTemplates).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/EntityTypeEditor.test.tsx`
Expected: FAIL — `EntityTypeEditor.tsx` doesn't exist yet.

- [ ] **Step 3: Write the component**

Create `src/components/EntityTypeEditor.tsx`:

```typescript
import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeCreateEntityTemplate,
  invokeUpdateEntityTemplate,
  invokeDeleteEntityTemplate,
} from "../hooks/useTauri";
import type { DefaultField, EntityTemplate, FieldType } from "../types/core";
import { ConfirmDialog } from "./ConfirmDialog";

const FIELD_TYPES: { label: string; type: FieldType }[] = [
  { label: "Short text", type: "text" },
  { label: "Long text", type: "textarea" },
  { label: "Number", type: "number" },
  { label: "Date", type: "date" },
  { label: "Select", type: "select" },
  { label: "Yes/No", type: "boolean" },
];

const FIELD_TYPE_COLORS: Record<FieldType, string> = {
  text: "#4A9FD4",
  textarea: "#4EA86B",
  number: "#E8883A",
  date: "#D4A24A",
  select: "#8B6FE8",
  boolean: "#D44A7A",
  multiselect: "#6B7280",
  entity_ref: "#6B7280",
  image: "#6B7280",
  url: "#6B7280",
  color: "#6B7280",
};

function emptyField(): DefaultField {
  return { name: "", label: "", field_type: "text", options: null, default_value: null };
}

function TemplateForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: EntityTemplate | null;
  onCancel: () => void;
  onSaved: (t: EntityTemplate) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [namePlural, setNamePlural] = useState(initial?.name_plural ?? "");
  const [color, setColor] = useState(initial?.color ?? "#8B6FE8");
  const [fields, setFields] = useState<DefaultField[]>(initial?.fields ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateField(index: number, patch: Partial<DefaultField>) {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: trimmed,
        name_plural: namePlural.trim() || `${trimmed}s`,
        color,
        fields,
      };
      const saved = initial
        ? await invokeUpdateEntityTemplate(initial.id, payload)
        : await invokeCreateEntityTemplate(payload);
      onSaved(saved);
    } catch {
      setError("Unable to save entity type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 p-4 bg-ink-surface border border-ink-border rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display text-gold">
          {initial ? "Edit Entity Type" : "New Entity Type"}
        </h3>
        <button onClick={onCancel} className="p-1 text-ivory-ghost hover:text-ivory" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full bg-ink-muted text-ivory text-sm px-2 py-1 rounded focus:outline-none"
      />
      <input
        value={namePlural}
        onChange={(e) => setNamePlural(e.target.value)}
        placeholder="Plural (optional)"
        className="w-full bg-ink-muted text-ivory text-sm px-2 py-1 rounded focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <label htmlFor="template-color" className="text-xs text-ivory-ghost">Color</label>
        <input
          id="template-color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-10 bg-transparent border border-ink-border rounded cursor-pointer"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-ivory-ghost uppercase tracking-wider">Default Properties</p>
          <button
            onClick={() => setFields([...fields, emptyField()])}
            className="flex items-center gap-1 text-xs bg-gold/20 text-gold rounded px-2 py-1 hover:bg-gold/30 transition-colors"
          >
            <Plus size={12} />
            Add Field
          </button>
        </div>

        {fields.length === 0 && (
          <p className="text-xs text-ivory-ghost italic px-1">No default properties yet.</p>
        )}

        {fields.map((field, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded border border-ink-border bg-ink-surface"
          >
            <span className="w-20 flex-shrink-0 text-[11px] font-mono text-ivory-ghost truncate">
              {field.name || "—"}
            </span>
            <input
              value={field.label}
              onChange={(e) =>
                updateField(i, {
                  label: e.target.value,
                  name: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                })
              }
              placeholder="Property label"
              className="flex-1 min-w-0 bg-transparent text-ivory text-sm font-medium px-1 py-1 focus:outline-none"
            />
            <select
              value={field.field_type}
              onChange={(e) => updateField(i, { field_type: e.target.value as FieldType })}
              className="text-[11px] font-mono uppercase tracking-wider rounded-full px-2.5 py-1 border-none focus:outline-none cursor-pointer flex-shrink-0"
              style={{
                color: FIELD_TYPE_COLORS[field.field_type],
                backgroundColor: `${FIELD_TYPE_COLORS[field.field_type]}22`,
              }}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.type} value={ft.type}>{ft.label}</option>
              ))}
            </select>
            <button
              onClick={() => removeField(i)}
              className="p-1 text-ivory-ghost hover:text-crimson flex-shrink-0"
              aria-label={`Remove property ${field.label || i + 1}`}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-[10px] text-crimson">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => void submit()}
          disabled={saving}
          className="flex-1 text-xs bg-gold/20 text-gold rounded py-1.5 hover:bg-gold/30 disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onCancel} className="flex-1 text-xs text-ivory-ghost rounded py-1.5 hover:bg-ink-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EntityTypeEditor() {
  const { entityTemplates, setEntityTemplates } = useAppStore();
  const [editing, setEditing] = useState<EntityTemplate | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EntityTemplate | null>(null);

  function handleSaved(template: EntityTemplate) {
    const exists = entityTemplates.some((t) => t.id === template.id);
    setEntityTemplates(
      exists
        ? entityTemplates.map((t) => (t.id === template.id ? template : t))
        : [...entityTemplates, template]
    );
    setEditing(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await invokeDeleteEntityTemplate(pendingDelete.id);
    setEntityTemplates(entityTemplates.filter((t) => t.id !== pendingDelete.id));
    setPendingDelete(null);
  }

  if (editing) {
    return (
      <TemplateForm
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="space-y-2">
      {entityTemplates.map((template) => (
        <div
          key={template.id}
          className="flex items-center justify-between px-3 py-2 rounded border border-ink-border"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: template.color }} />
            <span className="text-sm text-ivory">{template.name}</span>
            <span className="text-xs text-ivory-ghost">
              ({template.fields.length} {template.fields.length === 1 ? "property" : "properties"})
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(template)}
              className="p-1 text-ivory-ghost hover:text-ivory"
              aria-label={`Edit ${template.name}`}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setPendingDelete(template)}
              className="p-1 text-ivory-ghost hover:text-crimson"
              aria-label={`Delete ${template.name}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={() => setEditing("new")}
        className="flex items-center gap-1.5 mt-2 text-xs text-ivory-ghost hover:text-ivory"
      >
        <Plus size={12} />
        Add entity type
      </button>

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          description="Existing entities of this type in your projects are not affected — only new entities will no longer be creatable from this template."
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/EntityTypeEditor.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/EntityTypeEditor.tsx src/components/EntityTypeEditor.test.tsx
git commit -m "Add EntityTypeEditor: create/edit/delete application-level entity templates"
```

---

## Task 12: `SettingsScreen.tsx` — add the "Entity Types" tab

**Files:**
- Modify: `src/components/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `EntityTypeEditor` (Task 11).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Add the new section**

Replace the top of `src/components/SettingsScreen.tsx`:

```typescript
import { useState } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { StatisticsPanel } from "./StatisticsPanel";

type SettingsSection = "statistics";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "statistics", label: "Statistics" },
];
```

with:

```typescript
import { useState } from "react";
import { ArrowLeft, BarChart3, Shapes } from "lucide-react";
import { StatisticsPanel } from "./StatisticsPanel";
import { EntityTypeEditor } from "./EntityTypeEditor";

type SettingsSection = "statistics" | "entity-types";

const SECTIONS: { id: SettingsSection; label: string; icon: typeof BarChart3 }[] = [
  { id: "statistics", label: "Statistics", icon: BarChart3 },
  { id: "entity-types", label: "Entity Types", icon: Shapes },
];
```

Replace the nav button (which currently hardcodes `<BarChart3 />`):

```typescript
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              aria-current={activeSection === section.id}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition-colors ${
                activeSection === section.id
                  ? "bg-ink-muted text-gold"
                  : "text-ivory-ghost hover:text-ivory hover:bg-ink-muted"
              }`}
            >
              <BarChart3 size={14} />
              {section.label}
            </button>
          ))}
```

with:

```typescript
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              aria-current={activeSection === section.id}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition-colors ${
                activeSection === section.id
                  ? "bg-ink-muted text-gold"
                  : "text-ivory-ghost hover:text-ivory hover:bg-ink-muted"
              }`}
            >
              <section.icon size={14} />
              {section.label}
            </button>
          ))}
```

Replace the content area:

```typescript
      <main className="flex-1 overflow-y-auto p-6">
        {activeSection === "statistics" && <StatisticsPanel />}
      </main>
```

with:

```typescript
      <main className="flex-1 overflow-y-auto p-6">
        {activeSection === "statistics" && <StatisticsPanel />}
        {activeSection === "entity-types" && <EntityTypeEditor />}
      </main>
```

- [ ] **Step 2: Run the frontend suite**

Run: `npx vitest run`
Expected: PASS (check whether a `SettingsScreen.test.tsx` exists first — `find src/components -name "SettingsScreen.test.tsx"` — if it does, confirm it still passes; if it references `BarChart3` being hardcoded anywhere, update it to match this change).

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsScreen.tsx
git commit -m "Add Entity Types tab to Settings"
```

---

## Task 13: Full-project verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Run the full backend suite**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt -- --check`
Expected: all PASS/clean. (The pre-existing, unrelated `relation_repo.rs` `dead_code` warning only surfaces under `--all-targets`, which no task in this plan uses — not a regression to chase here.)

- [ ] **Step 2: Run the full frontend suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS/clean.

- [ ] **Step 3: Manual check — existing project untouched, templates drive new entities**

This cannot be scripted; do it by hand:
1. `npm run tauri dev`.
2. Open Settings → Entity Types on a fresh profile (or one where `entity_templates.json` doesn't exist yet under the app's data directory) and confirm the 5 builtins (Character, Location, Item, Event, Organization) appear.
3. Add a new template ("Planet", pick a color, add 2-3 properties: e.g. a number "Radius" and a select "Climate").
4. Open an existing project that predates this feature (already has its own `entity_types` rows). Confirm its existing entities are displayed exactly as before.
5. Click "Add New" — confirm "Planet" appears in the picker alongside the built-in names, even though this project has never had a "Planet" entity before.
6. Create a Planet entity. Confirm its properties match what you set up in the template.
7. Create a second Planet entity in the same project. Edit/delete one's properties; confirm the other's are unaffected.
8. Go back to Settings → Entity Types and delete the "Planet" template. Confirm both existing Planet entities are still fully visible/editable in the project, and "Planet" no longer appears in "Add New" anywhere.

- [ ] **Step 4: Final commit (if the manual check surfaced no changes) or fix-up commit (if it did)**

If everything in Step 3 matches expectations, there's nothing left to commit — Tasks 1-12 already committed the full change. If the manual check surfaces a bug, fix it, re-run Steps 1-2, and commit the fix with a message describing what was wrong.

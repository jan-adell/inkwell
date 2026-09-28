# Entity Templates (Application-Level Entity Editor) — Design Spec

**Date:** 2026-09-29
**Branch:** feature/entity_editor
**Status:** Approved for implementation

---

## Problem

Default properties per entity type name currently live in `src-tauri/src/db/default_properties.rs` as a hardcoded Rust `match` over 5 fixed names (Character, Location, Item, Event, Organization). The only way to add a new type name (e.g. "Planet", "Boss") or change what properties a type gets is to edit Rust source and ship a new build.

The user wants this catalog to become something they can edit themselves, entirely through the app, at runtime — an "Entity Editor" where they define, edit, and delete entity **templates** (a name, a color, and a set of default properties), with two hard constraints carried over from the entity-scoped-properties work that shipped just before this:

1. **Templates are pure application configuration.** They must never be written into any project's `project.db`, must never differ per-project, and editing/deleting a template must never retroactively change anything in an already-existing project.
2. **A project's own `entity_types` table stays exactly what it is today** (project-local, self-contained, portable — openable by another copy of the app, or a future version, without needing the app-level template list to be present or to match). It must not be pre-populated with every known template name; it should only ever contain the type names a project has **actually used**.

That second constraint means the current `entity_type_repo::seed_defaults` (which batch-creates all default type names into every project on open) has to go away — it's fundamentally a "copy the app-level list into the project" mechanism, which is exactly what's now disallowed. In its place, a project's `entity_types` table gets populated **lazily**: the first time an entity of a given type name is created in a project, that's the moment a project-local `entity_types` row for that name is created, if one doesn't already exist.

---

## Scope

1. A new, application-level (not per-project) store for entity templates: name, plural name, color, and a list of default properties — CRUD entirely through a new "Entity Types" tab in Settings.
2. The app ships with 5 built-in templates (Character, Location, Item, Organization, Event), seeded once on first launch, using the exact default property sets `default_properties.rs` already defines today. After that first seed, they're just regular templates — fully editable and deletable like anything the user adds themselves.
3. `entity_repo::create` changes to accept an entity type **name** instead of an existing `entity_type_id`, and does a lookup-or-create of the project's own `entity_types` row for that name before creating the entity — this is the one and only place a project's `entity_types` table ever gains a new row.
4. `entity_type_repo::seed_defaults` is deleted entirely, along with its two call sites in `commands/projects.rs` (`create_project`, `open_project`).
5. `default_properties.rs` is deleted; its content is repurposed only as the literal data used to seed the new template store on first launch.
6. Frontend: the "Add New" entity picker switches from listing a project's own (possibly empty) entity types to listing the app-level template list. A new `EntityTypeEditor` component (list + create/edit/delete templates, each with its own property-list editor) lives in a new Settings tab.

**Non-goals:** no change to the `entity_types` table's schema (same columns as today, just a different code path populates them). No per-project override of a template. No icon field (unused today; not adding it now — YAGNI). No change to how properties work once an entity exists (fully per-entity, already shipped, untouched by this work).

---

## Storage

Mirrors `src-tauri/src/db/registry.rs` exactly — that file already implements this exact pattern (a JSON file in Tauri's `app_data_dir`, used today for the "recent projects" list), so this reuses established convention rather than introducing a second one. No new SQLite database.

New file: `src-tauri/src/db/entity_templates.rs`

```rust
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultField {
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityTemplate {
    pub id: String,           // ULID — stable identity for editing in the UI
    pub name: String,
    pub name_plural: String,
    pub color: String,
    pub fields: Vec<DefaultField>,
}

fn templates_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("entity_templates.json")
}

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

pub fn create(app_data_dir: &Path, template: EntityTemplate) -> Result<EntityTemplate> {
    let mut templates = load(app_data_dir)?;
    templates.push(template.clone());
    save(app_data_dir, &templates)?;
    Ok(template)
}

pub fn update(app_data_dir: &Path, id: &str, updated: EntityTemplate) -> Result<EntityTemplate> {
    let mut templates = load(app_data_dir)?;
    let idx = templates.iter().position(|t| t.id == id)
        .ok_or_else(|| crate::error::InkwellError::NotFound(format!("EntityTemplate '{id}' not found")))?;
    templates[idx] = updated.clone();
    save(app_data_dir, &templates)?;
    Ok(updated)
}

pub fn delete(app_data_dir: &Path, id: &str) -> Result<()> {
    let mut templates = load(app_data_dir)?;
    templates.retain(|t| t.id != id);
    save(app_data_dir, &templates)
}

fn builtin_defaults() -> Vec<EntityTemplate> {
    // One EntityTemplate per entry in src-tauri/src/db/entity_type_repo.rs's
    // (removed) seed_defaults `defaults` array — name/name_plural/color taken
    // verbatim from that array (Character #8B6FE8, Location #4EA86B, Item
    // #E8883A, Event #4A9FD4, Organization #D44A7A). Each template's `fields`
    // is that same name's const from src-tauri/src/db/default_properties.rs
    // (CHARACTER_FIELDS, LOCATION_FIELDS, ITEM_FIELDS, EVENT_FIELDS,
    // ORGANIZATION_FIELDS — 6 fields each), converted from `&'static
    // [DefaultField]` (str-slice fields) to owned `Vec<DefaultField>`
    // (String fields) field-by-field, no other changes. This is the
    // implementation plan's job to spell out in full; not reproduced here
    // since it's a verbatim, mechanical copy of data that already exists
    // in the current source.
    vec![/* 5 EntityTemplate entries, built as described above */]
}

#[cfg(test)]
mod tests { /* load seeds builtins on first call; create/update/delete round-trip; update on missing id errors; matches registry.rs's own test style */ }
```

`EntityTemplate.name` is the join key everywhere else in the system (lazy `entity_types` creation, and default-property application at entity-creation time) — never `id`. Renaming a template only affects what a *future* name-match resolves to; nothing already created anywhere looks it up by name again.

---

## Backend: entity creation changes

### `models/entity.rs`

`CreateEntityRequest.entity_type_id: String` → `entity_type_name: String`.

### `db/entity_type_repo.rs`

- Delete `seed_defaults` entirely.
- Add:

```rust
/// Returns the project's existing entity_type row for this name, or creates
/// one (using the given color/plural as the initial values) if this project
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
    let next_sort_order = existing.iter().map(|t| t.sort_order).max().map(|m| m + 1).unwrap_or(0);
    create(conn, project_id, &CreateEntityTypeRequest {
        name: name.to_string(),
        name_plural: Some(name_plural.to_string()),
        icon: None,
        color: Some(color.to_string()),
        description: None,
        sort_order: Some(next_sort_order),
    })
}
```

### `db/entity_repo.rs::create`

```rust
pub fn create(
    conn: &Connection,
    project_id: &str,
    req: &CreateEntityRequest,
    templates: &[EntityTemplate],   // fetched by the command layer, passed in — keeps this fn pure/testable with no filesystem access, same as every other repo test in this codebase
) -> Result<Entity> {
    let matching_template = templates.iter().find(|t| t.name == req.entity_type_name);
    let (name_plural, color) = matching_template
        .map(|t| (t.name_plural.as_str(), t.color.as_str()))
        .unwrap_or((&req.entity_type_name, "#6B7280")); // generic fallback for a name with no matching template

    let entity_type = entity_type_repo::get_or_create_by_name(
        conn, project_id, &req.entity_type_name, name_plural, color,
    )?;

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);
    conn.execute(
        "INSERT INTO entities
            (id, project_id, entity_type_id, name, summary,
             visibility, sort_order, folder_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
        params![id, project_id, entity_type.id, req.name, req.summary,
                req.visibility.as_deref().unwrap_or("private"), sort_order, req.folder_id, now],
    )?;
    // (unchanged from today's implementation — only the source of entity_type.id changed,
    // from req.entity_type_id directly to the result of get_or_create_by_name above)

    if let Some(template) = matching_template {
        for (i, field) in template.fields.iter().enumerate() {
            field_definition_repo::create(conn, &CreateFieldDefinitionRequest {
                entity_id: id.clone(),
                name: field.name.clone(),
                label: field.label.clone(),
                field_type: field.field_type.clone(),
                options: field.options.clone(),
                default_value: field.default_value.clone(),
                is_required: None,
                visibility: None,
                sort_order: Some(i as i64),
            })?;
        }
    }

    get(conn, &id)
}
```

This replaces the current `default_properties::default_fields_for(&entity_type.name)` lookup (a compiled-in match) with a lookup against the `templates` slice the caller supplies — same shape, same behavior for the 5 built-ins, now driven by editable data instead of Rust source.

### `commands/entities.rs::create_entity`

Fetches the current template list via `entity_templates::load(&app_data_dir)` (the command layer already has `tauri::AppHandle`/`app_data_dir` access, same as `commands/projects.rs` does for `registry::load`), then calls `entity_repo::create(conn, project_id, req, &templates)`.

### `commands/projects.rs`

Remove both `entity_type_repo::seed_defaults(...)` call sites (`create_project`, `open_project`). Nothing replaces them — there is nothing left to pre-seed.

### New commands (`commands/entity_templates.rs`)

`list_entity_templates`, `create_entity_template`, `update_entity_template`, `delete_entity_template` — thin wrappers over `db::entity_templates`, each obtaining `app_data_dir` from `AppHandle`, matching the existing `registry`-backed commands' pattern (e.g. `list_known_projects`).

---

## Backward compatibility

Existing projects that already have `entity_types` rows from the now-removed `seed_defaults` (every project created since the entity-scoped-properties feature shipped) are completely unaffected: those rows already exist, so `get_or_create_by_name` finds them by name and returns them as-is — no new row, no behavior change. Their existing entities and properties are untouched, exactly as they are today.

If a user later deletes a template (say "Character") from the Entity Editor, any project that already has a "Character" `entity_types` row keeps working normally for everything already there — existing Characters remain fully visible and editable. The only consequence is that "Character" no longer appears in "Add New" for any project (new or existing), since that picker is now sourced from the template list, not from names the project happens to already contain. This is treated as intentional: deleting a template means "I don't want to create new ones of this via a template anymore."

---

## Frontend

### `src/types/core.ts`

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

`Entity`'s create-request type changes from `entity_type_id` to `entity_type_name` to match the backend.

### `src/hooks/useTauri.ts`

`invokeListEntityTemplates`, `invokeCreateEntityTemplate`, `invokeUpdateEntityTemplate`, `invokeDeleteEntityTemplate` — same one-line style as every other wrapper in this file. `invokeCreateEntity`'s request shape changes to `{ entity_type_name: string; name: string; folder_id?: string | null }`.

### `src/store/appStore.ts`

New slice: `entityTemplates: EntityTemplate[]`, `setEntityTemplates`. Loaded once, app-wide — **not** cleared by `resetProjectState()` (it isn't project data, exactly like `knownProjects` isn't). Loaded in `SplashPage.tsx` alongside the existing `invokeListKnownProjects()` call, refreshed after any Entity Editor CRUD action.

### `src/components/CreateEntityModal.tsx`

Maps `entityTemplates` (not `entityTypes`) to render the picker buttons; `invokeCreateEntity` payload sends `entity_type_name: template.name` instead of `entity_type_id`.

### `src/components/EntityTypeEditor.tsx` (new)

Lives in the new Settings tab. Lists all templates (color swatch, name, plural, field count) with Add/Edit/Delete. Deleting uses the existing `ConfirmDialog` component (`src/components/ConfirmDialog.tsx`) exactly as already used elsewhere for destructive actions. Editing a template opens a form: name, plural name, a color input, and a property-list editor (add/remove/reorder fields — name, label, field type, options-if-`select`, default-value-if-`boolean`) — reuses the same field-type choices already established in `EntityDetail.tsx`'s `AddPropertyForm` (text/textarea/number/date/image/entity_ref/multiselect/select/boolean), not a new picker design.

### `src/components/SettingsScreen.tsx`

Currently a single-section screen (`SECTIONS: [{ id: "statistics", ... }]`) — add `{ id: "entity-types", label: "Entity Types" }` to the existing `SECTIONS` array and render `<EntityTypeEditor />` when active, following the exact pattern already there. No restructuring of the existing tab mechanism.

---

## Testing

- `db/entity_templates.rs`: load seeds the 5 builtins on first call (no file exists yet) and persists them; create/update/delete round-trip through a temp `app_data_dir` (mirrors `registry.rs`'s own test style exactly, including using `tempfile::tempdir()`); update on a missing id returns `NotFound`.
- `db/entity_type_repo.rs`: `get_or_create_by_name` — creates a new row when the name doesn't exist yet (using the given color/plural, correct next `sort_order`); returns the existing row unchanged when the name already exists (proving no duplicate, no mutation of an existing row's other fields).
- `db/entity_repo.rs::create`: update existing tests to pass a `templates: &[EntityTemplate]` slice instead of relying on `default_properties`; add a test that creating an entity with a name matching no template still succeeds, with zero default properties and a generic fallback color on its freshly-created `entity_types` row.
- Frontend: `CreateEntityModal.test.tsx` updated to mock `entityTemplates` instead of `entityTypes` as the picker source; new `EntityTypeEditor.test.tsx` covering list/create/edit/delete, including the confirm-then-delete flow.

---

## Verification

1. `cargo test` / `npx vitest run` both green; `cargo clippy -- -D warnings`, `cargo fmt --check`, `npx tsc --noEmit` clean.
2. Manual: on a fresh install (no `entity_templates.json` yet), open Settings → Entity Types and confirm the 5 builtins appear. Add a new template ("Planet", a color, 2-3 properties). Open an existing project, click Add New, confirm "Planet" appears alongside the builtins even though this project has never had a "Planet" `entity_types` row before. Create a Planet entity; confirm its properties match the template. Create a second Planet entity in the same project; confirm editing/deleting one's properties doesn't affect the other's (already-shipped guarantee, now exercised through the new creation path). Delete the "Planet" template; confirm the existing Planet entities are still fully visible/editable in that project, and "Planet" no longer appears in Add New anywhere.

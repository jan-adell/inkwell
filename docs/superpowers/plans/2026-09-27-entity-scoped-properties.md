# Entity-Scoped Properties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move entity properties (`field_definitions`) from being shared per entity type to being owned per individual entity, so default properties apply once at entity-creation time without ever touching existing project data.

**Architecture:** A new nullable `entity_id` column (and CHECK-constrained-nullable `entity_type_id`) on `field_definitions`, added via an additive migration that changes zero existing rows. All new property creation — both the app-level default-properties automatism and the manual "Add Property" UI action — writes `entity_id`-scoped rows from now on; `entity_type_id`-scoped rows are left exactly as they are, forever, served by an unchanged legacy read path. The frontend merges both lists per entity being viewed.

**Tech Stack:** Rust (rusqlite, Tauri 2 commands), React + TypeScript (Zustand store, Vite/Vitest), SQLite migrations.

**Spec:** `docs/superpowers/specs/2026-09-27-entity-scoped-properties-design.md`

## Global Constraints

- Never modify or destructively migrate any existing `field_definitions` row — only additive schema changes and additive data (new rows).
- All new `field_definitions` rows are created with `entity_id` set and `entity_type_id` NULL; no code path may create a new `entity_type_id`-scoped row from this point on.
- `entity_type_repo::seed_defaults` only ever creates `entity_types` rows (name/plural/color) — it must not create any `field_definitions`.
- Default properties are applied exactly once, at the moment an entity is created (`entity_repo::create`), keyed by the entity's type **name** against the static catalog in `default_properties.rs` — never at type-creation time, never retroactively.
- Follow existing project conventions throughout: TDD (write the failing test first), `cargo fmt`/`cargo clippy -- -D warnings` clean, `npx tsc --noEmit` clean (ignoring the pre-existing unrelated `ProjectLibrary.tsx` unused-import error), migrations follow the table-rebuild pattern already used in `005_relations_unique_active_only.sql`.
- This session already has unrelated uncommitted changes to `src-tauri/src/db/entity_type_repo.rs`, `src/components/EntityDetail.tsx`, and `src/components/EntityDetail.test.tsx` (select/boolean field rendering, and the now-superseded per-type default-field-seeding logic). Task 3 and Task 9 below supersede/rewrite the relevant parts of those files — do not attempt to preserve the old field-seeding logic in `entity_type_repo.rs`; it is being deliberately removed.

## Review Focus

- A project with pre-existing `entity_type_id`-scoped `field_definitions` must display and remain deletable exactly as before — this is the whole point of "never touch existing data," so it gets its own migration-level test (Task 1) and its own frontend merge tests (Task 9 and Task 10).
- Two entities of the same recognized type name (e.g. two "Character" entities) must get fully independent default properties — editing/deleting one's fields must never affect the other's (Task 4).
- An entity created with an unrecognized type name, or the blank "Entity" type, must get zero default properties, not an error (Task 4).
- The two partial unique indexes must allow the same field `name` to be reused across different entities while still blocking a true duplicate within the same entity (Task 1 at the raw-SQL level, Task 2 at the repo level).
- `create_field_definition`'s empty-name/empty-label validation (in `commands/field_definitions.rs`) must still fire before touching the database after the request shape changes from `entity_type_id` to `entity_id`. No command file in this codebase has unit tests (thin pass-through wrappers, verified by `cargo build`), so this is pinned instead by Task 5 showing the two validation blocks preserved byte-for-byte in the diff, plus Task 2's repo-level tests (`invalid_field_type_rejected`, the visibility check) covering the validation that does live below the command layer.

---

## Task 1: Migration 006 — entity-scoped field_definitions

**Files:**
- Create: `src-tauri/src/db/migrations/006_entity_scoped_field_definitions.sql`
- Modify: `src-tauri/src/db/migrations.rs:20-45` (register migration 6), and its `#[cfg(test)] mod tests` block (add new tests)

**Interfaces:**
- Consumes: nothing new — pure SQL schema change.
- Produces: `field_definitions` table now has nullable `entity_type_id`, nullable `entity_id`, a CHECK constraint requiring exactly one to be set, and two partial unique indexes (`idx_field_definitions_active_name_by_type`, `idx_field_definitions_active_name_by_entity`) replacing the old single index. Task 2 depends on this shape.

- [ ] **Step 1: Write the migration SQL**

Create `src-tauri/src/db/migrations/006_entity_scoped_field_definitions.sql`:

```sql
-- Migration 006: entity_scoped_field_definitions
--
-- field_definitions currently always belongs to an entity_type (shared by
-- every entity of that type). Properties are moving to be owned by the
-- individual entity instead. Existing entity_type-scoped rows are left
-- exactly as they are — this is purely additive: entity_type_id becomes
-- nullable, entity_id is added, and a CHECK constraint enforces that a row
-- is scoped to exactly one owner. No new field_definitions will ever be
-- created with entity_type_id going forward; it remains only to keep
-- pre-existing rows working unchanged.

CREATE TABLE field_definitions_new (
    id              TEXT    NOT NULL PRIMARY KEY,
    entity_type_id  TEXT    REFERENCES entity_types(id),
    entity_id       TEXT    REFERENCES entities(id),
    name            TEXT    NOT NULL,
    label           TEXT    NOT NULL,
    field_type      TEXT    NOT NULL,
    options         TEXT,
    default_value   TEXT,
    is_required     INTEGER NOT NULL DEFAULT 0,
    visibility      TEXT    NOT NULL DEFAULT 'private',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    deleted_at      TEXT,
    CHECK ((entity_type_id IS NOT NULL) != (entity_id IS NOT NULL))
);

INSERT INTO field_definitions_new
    (id, entity_type_id, entity_id, name, label, field_type, options,
     default_value, is_required, visibility, sort_order, created_at, deleted_at)
SELECT
    id, entity_type_id, NULL, name, label, field_type, options,
    default_value, is_required, visibility, sort_order, created_at, deleted_at
FROM field_definitions;

DROP TABLE field_definitions;
ALTER TABLE field_definitions_new RENAME TO field_definitions;

CREATE UNIQUE INDEX idx_field_definitions_active_name_by_type
    ON field_definitions(entity_type_id, name)
    WHERE deleted_at IS NULL AND entity_type_id IS NOT NULL;

CREATE UNIQUE INDEX idx_field_definitions_active_name_by_entity
    ON field_definitions(entity_id, name)
    WHERE deleted_at IS NULL AND entity_id IS NOT NULL;
```

- [ ] **Step 2: Register the migration**

In `src-tauri/src/db/migrations.rs`, in `all_migrations()`, add after the version-5 entry (before the closing `]`):

```rust
        Migration {
            version: 6,
            name: "entity_scoped_field_definitions",
            sql: include_str!("migrations/006_entity_scoped_field_definitions.sql"),
        },
```

- [ ] **Step 3: Write the failing tests**

In `src-tauri/src/db/migrations.rs`, inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn migration_006_preserves_legacy_rows_and_allows_entity_scoped_rows() {
        let mut conn = test_conn();
        run_pending_migrations(&mut conn).unwrap();

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

        // Legacy shape: entity_type_id set, entity_id NULL — must still be insertable.
        conn.execute(
            "INSERT INTO field_definitions(id,entity_type_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-legacy','et1','edad','Edad','text',0,'private',0,'2026-01-01')",
            [],
        ).unwrap();

        // New shape: entity_id set, entity_type_id NULL — must be insertable.
        conn.execute(
            "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-new','e1','nickname','Nickname','text',0,'private',0,'2026-01-01')",
            [],
        ).unwrap();

        let legacy_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM field_definitions WHERE entity_type_id='et1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(legacy_count, 1);

        let new_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM field_definitions WHERE entity_id='e1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(new_count, 1);
    }

    #[test]
    fn migration_006_check_constraint_rejects_both_owners_set() {
        let mut conn = test_conn();
        run_pending_migrations(&mut conn).unwrap();
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

        let result = conn.execute(
            "INSERT INTO field_definitions(id,entity_type_id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-bad','et1','e1','x','X','text',0,'private',0,'2026-01-01')",
            [],
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
             VALUES('e1','p1','et1','Kael','private',0,'2026-01-01','2026-01-01'),
                    ('e2','p1','et1','Aren','private',1,'2026-01-01','2026-01-01')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd1','e1','nickname','Nickname','text',0,'private',0,'2026-01-01')",
            [],
        ).unwrap();

        // Same name on a different entity is fine.
        conn.execute(
            "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd2','e2','nickname','Nickname','text',0,'private',0,'2026-01-01')",
            [],
        ).unwrap();

        // Same name on the SAME entity again must fail.
        let dup = conn.execute(
            "INSERT INTO field_definitions(id,entity_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd3','e1','nickname','Nickname 2','text',0,'private',0,'2026-01-01')",
            [],
        );
        assert!(dup.is_err());
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib migrations`
Expected: all 4 new tests PASS (this migration is pure SQL with no application code depending on it yet, so there is no separate red/green step here beyond "does the SQL apply and behave correctly" — write the SQL, then confirm via these tests).

- [ ] **Step 5: Run the full migration test suite and existing repo tests to confirm nothing else broke**

Run: `cd src-tauri && cargo test --lib migrations && cargo test --lib field_definition_repo`
Expected: PASS. (`field_definition_repo`'s existing tests still pass unmodified at this point — they only touch `entity_type_id`-shaped rows, which this migration doesn't change.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/migrations/006_entity_scoped_field_definitions.sql src-tauri/src/db/migrations.rs
git commit -m "Add migration 006: entity-scoped field_definitions"
```

---

## Task 2: `field_definition.rs` model + `field_definition_repo.rs` — entity-scoped create/list

**Files:**
- Modify: `src-tauri/src/models/field_definition.rs` (full file)
- Modify: `src-tauri/src/db/field_definition_repo.rs` (full file, including its `#[cfg(test)] mod tests` block)

**Interfaces:**
- Consumes: migration 006's schema (Task 1).
- Produces: `FieldDefinition { entity_type_id: Option<String>, entity_id: Option<String>, .. }`, `CreateFieldDefinitionRequest { entity_id: String, .. }` (no more `entity_type_id` on create), `field_definition_repo::create(conn, &req)`, `field_definition_repo::list_by_entity_type(conn, entity_type_id: &str)`, `field_definition_repo::list_by_entity(conn, entity_id: &str)`. Task 4 (entity_repo) and Task 5 (commands) both consume these exact names.

- [ ] **Step 1: Update the model**

Replace `src-tauri/src/models/field_definition.rs` in full:

```rust
use serde::{Deserialize, Serialize};

/// Valid field types — mirrors the values accepted by the schema.
pub const VALID_FIELD_TYPES: &[&str] = &[
    "text",
    "textarea",
    "number",
    "boolean",
    "date",
    "select",
    "multiselect",
    "entity_ref",
    "url",
    "color",
    "image",
];

/// A custom property. Maps to the `field_definitions` table.
///
/// Exactly one of `entity_type_id` / `entity_id` is set on any row:
/// `entity_type_id` only ever appears on rows created before properties
/// became entity-scoped (kept working, never written to again);
/// `entity_id` is set on every row created from now on.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDefinition {
    pub id: String,
    pub entity_type_id: Option<String>,
    pub entity_id: Option<String>,
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>, // JSON array for select/multiselect
    pub default_value: Option<String>,
    pub is_required: bool,
    pub visibility: String, // 'private' | 'beta' | 'public'
    pub sort_order: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

/// Input for creating a field definition. Creation is always entity-scoped.
#[derive(Debug, Deserialize)]
pub struct CreateFieldDefinitionRequest {
    pub entity_id: String,
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
    pub is_required: Option<bool>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
}

/// Input for updating a field definition.
#[derive(Debug, Deserialize)]
pub struct UpdateFieldDefinitionRequest {
    pub label: Option<String>,
    pub options: Option<String>,
    pub default_value: Option<String>,
    pub is_required: Option<bool>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
}
```

- [ ] **Step 2: Write the failing tests for the repo**

Replace the `#[cfg(test)] mod tests` block at the bottom of `src-tauri/src/db/field_definition_repo.rs` with:

```rust
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

    /// Seeds a project, one entity_type, and two entities of that type.
    /// Returns (project_id, entity_type_id, entity_a_id, entity_b_id).
    fn seed(conn: &Connection) -> (String, String, String, String) {
        let pid = "01PROJ000000000000000000001".to_string();
        let etid = "01ETYPE00000000000000000001".to_string();
        let eid_a = "01ENTITYA000000000000000001".to_string();
        let eid_b = "01ENTITYB000000000000000001".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Personaje',0,0,'2026-01-01','2026-01-01')",
            params![etid, pid],
        ).unwrap();
        conn.execute(
            "INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at)
             VALUES(?1,?2,?3,'Kael','private',0,'2026-01-01','2026-01-01')",
            params![eid_a, pid, etid],
        ).unwrap();
        conn.execute(
            "INSERT INTO entities(id,project_id,entity_type_id,name,visibility,sort_order,created_at,updated_at)
             VALUES(?1,?2,?3,'Aren','private',1,'2026-01-01','2026-01-01')",
            params![eid_b, pid, etid],
        ).unwrap();
        (pid, etid, eid_a, eid_b)
    }

    fn make_req(eid: &str, name: &str) -> CreateFieldDefinitionRequest {
        CreateFieldDefinitionRequest {
            entity_id: eid.into(),
            name: name.into(),
            label: name.into(),
            field_type: "text".into(),
            options: None,
            default_value: None,
            is_required: None,
            visibility: None,
            sort_order: None,
        }
    }

    #[test]
    fn create_field_definition() {
        let conn = test_conn();
        let (_, _, eid, _) = seed(&conn);
        let fd = create(&conn, &make_req(&eid, "edad")).unwrap();
        assert_eq!(fd.name, "edad");
        assert_eq!(fd.visibility, "private");
        assert_eq!(fd.entity_id.as_deref(), Some(eid.as_str()));
        assert_eq!(fd.entity_type_id, None);
    }

    #[test]
    fn duplicate_active_name_rejected_within_same_entity() {
        let conn = test_conn();
        let (_, _, eid, _) = seed(&conn);
        create(&conn, &make_req(&eid, "edad")).unwrap();
        let result = create(&conn, &make_req(&eid, "edad"));
        assert!(matches!(result, Err(InkwellError::Conflict(_))));
    }

    #[test]
    fn same_name_allowed_across_different_entities() {
        let conn = test_conn();
        let (_, _, eid_a, eid_b) = seed(&conn);
        let fd_a = create(&conn, &make_req(&eid_a, "nickname")).unwrap();
        let fd_b = create(&conn, &make_req(&eid_b, "nickname")).unwrap();
        assert_ne!(fd_a.id, fd_b.id);
        assert_eq!(fd_a.name, fd_b.name);
    }

    #[test]
    fn name_reuse_after_soft_delete() {
        let conn = test_conn();
        let (_, _, eid, _) = seed(&conn);
        let fd = create(&conn, &make_req(&eid, "edad")).unwrap();
        delete(&conn, &fd.id).unwrap();
        let fd2 = create(&conn, &make_req(&eid, "edad")).unwrap();
        assert_eq!(fd2.name, "edad");
        assert_ne!(fd.id, fd2.id);
    }

    #[test]
    fn invalid_field_type_rejected() {
        let conn = test_conn();
        let (_, _, eid, _) = seed(&conn);
        let mut req = make_req(&eid, "x");
        req.field_type = "wizard".into();
        let result = create(&conn, &req);
        assert!(matches!(result, Err(InkwellError::Validation(_))));
    }

    #[test]
    fn list_by_entity_returns_active_only() {
        let conn = test_conn();
        let (_, _, eid, _) = seed(&conn);
        let fd = create(&conn, &make_req(&eid, "nombre")).unwrap();
        create(&conn, &make_req(&eid, "edad")).unwrap();
        delete(&conn, &fd.id).unwrap();
        let list = list_by_entity(&conn, &eid).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "edad");
    }

    #[test]
    fn list_by_entity_type_still_serves_legacy_rows() {
        let conn = test_conn();
        let (_, etid, _, _) = seed(&conn);
        // Simulate a pre-existing legacy row, inserted directly (as it would
        // have been before this change), not through create().
        conn.execute(
            "INSERT INTO field_definitions(id,entity_type_id,name,label,field_type,is_required,visibility,sort_order,created_at)
             VALUES('fd-legacy',?1,'edad','Edad','text',0,'private',0,'2026-01-01')",
            params![etid],
        ).unwrap();

        let legacy = list_by_entity_type(&conn, &etid).unwrap();
        assert_eq!(legacy.len(), 1);
        assert_eq!(legacy[0].name, "edad");
        assert_eq!(legacy[0].entity_type_id.as_deref(), Some(etid.as_str()));
        assert_eq!(legacy[0].entity_id, None);
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail to compile / fail**

Run: `cd src-tauri && cargo test --lib field_definition_repo`
Expected: compile errors (`create` still expects old `CreateFieldDefinitionRequest` shape with `entity_type_id`, `list_by_entity`/`list_by_entity_type` don't exist yet).

- [ ] **Step 4: Update `create`, `row_to_fd`, `get`, and rename/add the list functions**

In `src-tauri/src/db/field_definition_repo.rs`, replace `row_to_fd`, `create`, `get`, and `list` with:

```rust
fn row_to_fd(row: &rusqlite::Row) -> rusqlite::Result<FieldDefinition> {
    Ok(FieldDefinition {
        id: row.get(0)?,
        entity_type_id: row.get(1)?,
        entity_id: row.get(2)?,
        name: row.get(3)?,
        label: row.get(4)?,
        field_type: row.get(5)?,
        options: row.get(6)?,
        default_value: row.get(7)?,
        is_required: row.get::<_, i64>(8)? != 0,
        visibility: row.get(9)?,
        sort_order: row.get(10)?,
        created_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}

pub fn create(conn: &Connection, req: &CreateFieldDefinitionRequest) -> Result<FieldDefinition> {
    if !VALID_FIELD_TYPES.contains(&req.field_type.as_str()) {
        return Err(InkwellError::Validation(format!(
            "Invalid field_type '{}'. Valid types: {}",
            req.field_type,
            VALID_FIELD_TYPES.join(", ")
        )));
    }

    let visibility = req.visibility.as_deref().unwrap_or("private");
    if !matches!(visibility, "private" | "beta" | "public") {
        return Err(InkwellError::Validation(format!(
            "Invalid visibility '{visibility}'. Must be 'private', 'beta', or 'public'"
        )));
    }

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let sort_order = req.sort_order.unwrap_or(0);
    let is_required = req.is_required.unwrap_or(false) as i64;

    conn.execute(
        "INSERT INTO field_definitions
            (id, entity_id, name, label, field_type, options, default_value,
             is_required, visibility, sort_order, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            id,
            req.entity_id,
            req.name,
            req.label,
            req.field_type,
            req.options,
            req.default_value,
            is_required,
            visibility,
            sort_order,
            now
        ],
    )
    .map_err(|e| {
        // Map SQLite UNIQUE violation to a domain Conflict error
        if let rusqlite::Error::SqliteFailure(ref err, _) = e {
            if err.code == rusqlite::ErrorCode::ConstraintViolation {
                return InkwellError::Conflict(format!(
                    "An active field named '{}' already exists on this entity",
                    req.name
                ));
            }
        }
        InkwellError::Database(e)
    })?;

    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> Result<FieldDefinition> {
    conn.query_row(
        "SELECT id,entity_type_id,entity_id,name,label,field_type,options,default_value,
                is_required,visibility,sort_order,created_at,deleted_at
         FROM field_definitions WHERE id=?1",
        params![id],
        row_to_fd,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            InkwellError::NotFound(format!("FieldDefinition '{id}' not found"))
        }
        other => InkwellError::Database(other),
    })
}

/// Legacy read path: serves field_definitions rows created before properties
/// became entity-scoped. Never written to by `create` — kept only so
/// pre-existing rows keep displaying exactly as before.
pub fn list_by_entity_type(conn: &Connection, entity_type_id: &str) -> Result<Vec<FieldDefinition>> {
    let mut stmt = conn.prepare(
        "SELECT id,entity_type_id,entity_id,name,label,field_type,options,default_value,
                is_required,visibility,sort_order,created_at,deleted_at
         FROM field_definitions
         WHERE entity_type_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, label ASC",
    )?;
    let rows = stmt.query_map(params![entity_type_id], row_to_fd)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}

pub fn list_by_entity(conn: &Connection, entity_id: &str) -> Result<Vec<FieldDefinition>> {
    let mut stmt = conn.prepare(
        "SELECT id,entity_type_id,entity_id,name,label,field_type,options,default_value,
                is_required,visibility,sort_order,created_at,deleted_at
         FROM field_definitions
         WHERE entity_id=?1 AND deleted_at IS NULL
         ORDER BY sort_order ASC, label ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], row_to_fd)?;
    rows.map(|r| r.map_err(InkwellError::Database)).collect()
}
```

Leave `update` and `delete` exactly as they are — they operate purely on `id` and don't reference `entity_type_id`/`entity_id`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib field_definition_repo`
Expected: PASS (7 tests: `create_field_definition`, `duplicate_active_name_rejected_within_same_entity`, `same_name_allowed_across_different_entities`, `name_reuse_after_soft_delete`, `invalid_field_type_rejected`, `list_by_entity_returns_active_only`, `list_by_entity_type_still_serves_legacy_rows`).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models/field_definition.rs src-tauri/src/db/field_definition_repo.rs
git commit -m "Make field_definitions entity-scoped; keep legacy type-scoped read path"
```

---

## Task 3: `default_properties.rs` module + simplify `entity_type_repo::seed_defaults`

**Files:**
- Create: `src-tauri/src/db/default_properties.rs`
- Modify: `src-tauri/src/db/entity_type_repo.rs` (remove the `DefaultField`/`field`/`field_with_options`/`*_FIELDS`/`default_fields_for` items and the field-seeding half of `seed_defaults`, and the field-content tests that tested them)
- Modify: `src-tauri/src/db/mod.rs` — register the new `default_properties` module (read the file first to match its existing `pub mod ...;` list style)

**Interfaces:**
- Consumes: nothing.
- Produces: `pub struct DefaultField { pub name: &'static str, pub label: &'static str, pub field_type: &'static str, pub options: Option<&'static str>, pub default_value: Option<&'static str> }` and `pub fn default_fields_for(entity_type_name: &str) -> &'static [DefaultField]`. Task 4 (`entity_repo::create`) consumes this.

- [ ] **Step 1: Check the module registration style**

Run: `grep -n "pub mod" src-tauri/src/db/mod.rs`
Use whatever style is already there (e.g. `pub mod entity_type_repo;`) for the new line.

- [ ] **Step 2: Create the new module with the moved catalog and its tests**

Create `src-tauri/src/db/default_properties.rs`:

```rust
//! Static, application-level catalog of default properties per recognized
//! entity type name. Applied once, by `entity_repo::create`, at the moment
//! an entity is created — never at type-creation time, never retroactively.

pub struct DefaultField {
    pub name: &'static str,
    pub label: &'static str,
    pub field_type: &'static str,
    pub options: Option<&'static str>,
    pub default_value: Option<&'static str>,
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

pub fn default_fields_for(entity_type_name: &str) -> &'static [DefaultField] {
    match entity_type_name {
        "Character" => CHARACTER_FIELDS,
        "Location" => LOCATION_FIELDS,
        "Item" => ITEM_FIELDS,
        "Event" => EVENT_FIELDS,
        "Organization" => ORGANIZATION_FIELDS,
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn character_has_expected_fields() {
        let fields: Vec<(&str, &str)> = default_fields_for("Character")
            .iter()
            .map(|f| (f.name, f.field_type))
            .collect();
        assert_eq!(
            fields,
            vec![
                ("birth_date", "date"),
                ("height", "number"),
                ("eye_color", "select"),
                ("occupation", "text"),
                ("personality", "textarea"),
                ("alive", "boolean"),
            ]
        );
    }

    #[test]
    fn each_named_type_has_six_fields() {
        for name in ["Character", "Location", "Item", "Event", "Organization"] {
            assert_eq!(
                default_fields_for(name).len(),
                6,
                "expected 6 default fields for {name}"
            );
        }
    }

    #[test]
    fn unrecognized_or_blank_type_names_have_no_default_fields() {
        assert!(default_fields_for("Entity").is_empty());
        assert!(default_fields_for("Some Custom Type").is_empty());
    }
}
```

- [ ] **Step 3: Register the module**

In `src-tauri/src/db/mod.rs`, add `pub mod default_properties;` alongside the other `pub mod` declarations (matching the existing alphabetical/grouping style already in that file).

- [ ] **Step 4: Run the new module's tests**

Run: `cd src-tauri && cargo test --lib default_properties`
Expected: PASS (3 tests).

- [ ] **Step 5: Remove the moved code and simplify `seed_defaults` in `entity_type_repo.rs`**

In `src-tauri/src/db/entity_type_repo.rs`:

1. Delete the `DefaultField` struct, `field`/`field_with_options` functions, `CHARACTER_FIELDS`/`LOCATION_FIELDS`/`ITEM_FIELDS`/`EVENT_FIELDS`/`ORGANIZATION_FIELDS` consts, and `default_fields_for` function (lines 8–126 in the current file) — this content now lives in `default_properties.rs`.
2. Remove the now-unused imports `use crate::db::field_definition_repo;` and `use crate::models::field_definition::CreateFieldDefinitionRequest;` from the top of the file.
3. Replace `seed_defaults` with:

```rust
/// Ensures every default entity type exists in the project, creating whichever
/// ones (by name) are still missing. A type that already exists — regardless
/// of how the project came to have it — is never modified. Safe to call on
/// every project open, for any project. Creates entity_types rows only —
/// properties are applied per-entity at entity-creation time instead
/// (see `entity_repo::create`).
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

        create(
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
    }
    Ok(())
}
```

- [ ] **Step 6: Remove the tests that asserted field-seeding behavior, since that responsibility moved**

In the `#[cfg(test)] mod tests` block of `src-tauri/src/db/entity_type_repo.rs`:
1. Remove the `use crate::db::field_definition_repo;` import from the test module.
2. Delete these test functions entirely (they tested the now-removed field-seeding logic): `field_names_and_types` (helper), `seed_defaults_entity_type_has_no_fields`, `seed_defaults_character_gets_expected_fields`, `seed_defaults_named_types_each_get_six_fields`.
3. In `seed_defaults_adds_only_missing_types_to_an_existing_project`, remove the trailing assertion block that calls `field_definition_repo::list` (the `// The pre-existing Character type must be untouched...` comment and its two lines) — keep the rest of that test (it still correctly asserts the pre-existing "Character" row's `id` is unchanged and that "Entity" got added).

All other tests in this file (`create_and_get`, `list_returns_active_only`, `update_partial`, `soft_delete`, `seed_defaults_creates_six_types`, `seed_defaults_is_idempotent`, `seed_defaults_assigns_sort_order_in_order`, `seed_defaults_adds_missing_defaults_alongside_a_custom_type`, `cannot_delete_system_type`) are unaffected and stay as they are.

- [ ] **Step 7: Run the full test suite for both files**

Run: `cd src-tauri && cargo test --lib entity_type_repo default_properties`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/db/default_properties.rs src-tauri/src/db/entity_type_repo.rs src-tauri/src/db/mod.rs
git commit -m "Move default-properties catalog out of entity_type_repo; seed_defaults no longer seeds fields"
```

---

## Task 4: `entity_repo::create` applies default properties at entity-creation time

**Files:**
- Modify: `src-tauri/src/db/entity_repo.rs` (full file — `create` function and its `#[cfg(test)] mod tests` block)

**Interfaces:**
- Consumes: `default_properties::default_fields_for(name: &str) -> &'static [DefaultField]` (Task 3), `field_definition_repo::create(conn, &CreateFieldDefinitionRequest)` (Task 2), `entity_type_repo::get(conn, id) -> Result<EntityType>` (existing, unchanged).
- Produces: `entity_repo::create` now also creates entity-scoped `field_definitions` as a side effect. No signature change — `commands/entities.rs::create_entity` (which calls this) needs no change.

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/db/entity_repo.rs`, add to the `#[cfg(test)] mod tests` block (after the existing `use` lines, before `fn test_conn`):

```rust
    use crate::db::field_definition_repo;
```

Then add these test functions (after the existing `list_root_entities_excludes_folder_members` test, before the closing `}` of the module):

```rust
    #[test]
    fn create_applies_default_properties_for_a_recognized_type_name() {
        let conn = test_conn();
        let pid = "01PROJ000000000000000000002".to_string();
        conn.execute(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES(?1,'P','2026-01-01','2026-01-01')",
            params![pid],
        ).unwrap();
        let etid = "01ETYPE00000000000000000002".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Character',0,0,'2026-01-01','2026-01-01')",
            params![etid, pid],
        ).unwrap();

        let entity = create(&conn, &pid, &make_entity(&etid, "Kael")).unwrap();

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
        let etid = "01ETYPE00000000000000000003".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Character',0,0,'2026-01-01','2026-01-01')",
            params![etid, pid],
        ).unwrap();

        let kael = create(&conn, &pid, &make_entity(&etid, "Kael")).unwrap();
        let aren = create(&conn, &pid, &make_entity(&etid, "Aren")).unwrap();

        let kael_fields = field_definition_repo::list_by_entity(&conn, &kael.id).unwrap();
        let aren_fields = field_definition_repo::list_by_entity(&conn, &aren.id).unwrap();
        assert_eq!(kael_fields.len(), 6);
        assert_eq!(aren_fields.len(), 6);
        assert_ne!(kael_fields[0].id, aren_fields[0].id);

        // Deleting one entity's field must not affect the other's.
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
        let entity_etid = "01ETYPE00000000000000000004".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'Entity',0,0,'2026-01-01','2026-01-01')",
            params![entity_etid, pid],
        ).unwrap();
        let custom_etid = "01ETYPE00000000000000000005".to_string();
        conn.execute(
            "INSERT INTO entity_types(id,project_id,name,is_system,sort_order,created_at,updated_at)
             VALUES(?1,?2,'MyCustomType',0,1,'2026-01-01','2026-01-01')",
            params![custom_etid, pid],
        ).unwrap();

        let blank_entity = create(&conn, &pid, &make_entity(&entity_etid, "Something")).unwrap();
        let custom_entity = create(&conn, &pid, &make_entity(&custom_etid, "Something Else")).unwrap();

        assert!(field_definition_repo::list_by_entity(&conn, &blank_entity.id).unwrap().is_empty());
        assert!(field_definition_repo::list_by_entity(&conn, &custom_entity.id).unwrap().is_empty());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib entity_repo`
Expected: FAIL — `create` doesn't yet create any field_definitions, so `fields.len()` assertions fail (`0 != 6`, etc).

- [ ] **Step 3: Implement default-property application in `create`**

In `src-tauri/src/db/entity_repo.rs`, add the imports at the top:

```rust
use crate::db::{default_properties, entity_type_repo, field_definition_repo};
use crate::models::field_definition::CreateFieldDefinitionRequest;
```

Then change `create`'s final lines from:

```rust
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
```

to:

```rust
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

    let entity_type = entity_type_repo::get(conn, &req.entity_type_id)?;
    for (i, default_field) in default_properties::default_fields_for(&entity_type.name).iter().enumerate() {
        field_definition_repo::create(
            conn,
            &CreateFieldDefinitionRequest {
                entity_id: id.clone(),
                name: default_field.name.to_string(),
                label: default_field.label.to_string(),
                field_type: default_field.field_type.to_string(),
                options: default_field.options.map(|s| s.to_string()),
                default_value: default_field.default_value.map(|s| s.to_string()),
                is_required: None,
                visibility: None,
                sort_order: Some(i as i64),
            },
        )?;
    }

    get(conn, &id)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test --lib entity_repo`
Expected: PASS (all existing entity_repo tests plus the 3 new ones).

- [ ] **Step 5: Run the full backend test suite**

Run: `cd src-tauri && cargo test`
Expected: PASS. This is the first point where every backend piece is wired together — a good checkpoint before touching commands/frontend.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/entity_repo.rs
git commit -m "Apply default properties to a new entity at creation time"
```

---

## Task 5: `commands/field_definitions.rs` + `lib.rs` registration

**Files:**
- Modify: `src-tauri/src/commands/field_definitions.rs` (full file)
- Modify: `src-tauri/src/lib.rs:38-41` (command registration)

**Interfaces:**
- Consumes: `field_definition_repo::list_by_entity_type`, `field_definition_repo::list_by_entity`, `CreateFieldDefinitionRequest { entity_id, .. }` (Task 2).
- Produces: Tauri commands `list_field_definitions_by_type`, `list_field_definitions_by_entity`, unchanged `create_field_definition` (now entity-scoped), `update_field_definition`, `delete_field_definition`. Task 7 (frontend `useTauri.ts`) consumes these exact command name strings.

- [ ] **Step 1: Update the command file**

Replace `create_field_definition` and `list_field_definitions` in `src-tauri/src/commands/field_definitions.rs`:

```rust
#[tauri::command]
pub async fn create_field_definition(
    state: State<'_, AppState>,
    req: CreateFieldDefinitionRequest,
) -> Result<FieldDefinition> {
    if req.name.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Field name cannot be empty".into(),
        ));
    }
    if req.label.trim().is_empty() {
        return Err(InkwellError::Validation(
            "Field label cannot be empty".into(),
        ));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_definition_repo::create(&conn, &req)
}

#[tauri::command]
pub async fn list_field_definitions_by_type(
    state: State<'_, AppState>,
    entity_type_id: String,
) -> Result<Vec<FieldDefinition>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_definition_repo::list_by_entity_type(&conn, &entity_type_id)
}

#[tauri::command]
pub async fn list_field_definitions_by_entity(
    state: State<'_, AppState>,
    entity_id: String,
) -> Result<Vec<FieldDefinition>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| InkwellError::Internal("DB lock poisoned".into()))?;
    field_definition_repo::list_by_entity(&conn, &entity_id)
}
```

`update_field_definition` and `delete_field_definition` are unchanged — leave them exactly as they are in the file.

- [ ] **Step 2: Update command registration**

In `src-tauri/src/lib.rs`, replace:

```rust
            // Field definitions
            commands::field_definitions::create_field_definition,
            commands::field_definitions::list_field_definitions,
            commands::field_definitions::update_field_definition,
            commands::field_definitions::delete_field_definition,
```

with:

```rust
            // Field definitions
            commands::field_definitions::create_field_definition,
            commands::field_definitions::list_field_definitions_by_type,
            commands::field_definitions::list_field_definitions_by_entity,
            commands::field_definitions::update_field_definition,
            commands::field_definitions::delete_field_definition,
```

- [ ] **Step 3: Verify the crate compiles**

Run: `cd src-tauri && cargo build`
Expected: no errors. There are no Rust unit tests for Tauri command wrappers in this codebase (they're thin pass-throughs tested via the underlying repo tests already covering this logic) — `cargo build` succeeding is the verification for this task.

- [ ] **Step 4: Run the full backend suite once more**

Run: `cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt -- --check`
Expected: all PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/field_definitions.rs src-tauri/src/lib.rs
git commit -m "Split list_field_definitions into by-type (legacy) and by-entity commands"
```

---

## Task 6: Frontend types — `core.ts`

**Files:**
- Modify: `src/types/core.ts:83-96`

**Interfaces:**
- Consumes: nothing.
- Produces: `FieldDefinition { entity_type_id: string | null; entity_id: string | null; .. }`. Tasks 7, 9, 10, 11 consume this type.

- [ ] **Step 1: Update the type**

In `src/types/core.ts`, replace:

```typescript
export interface FieldDefinition {
  id: string;
  entity_type_id: string;
  name: string;
  label: string;
  field_type: FieldType;
  options: string | null;
  default_value: string | null;
  is_required: boolean;
  visibility: string;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}
```

with:

```typescript
export interface FieldDefinition {
  id: string;
  entity_type_id: string | null;
  entity_id: string | null;
  name: string;
  label: string;
  field_type: FieldType;
  options: string | null;
  default_value: string | null;
  is_required: boolean;
  visibility: string;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}
```

- [ ] **Step 2: Confirm the type-check fails elsewhere as expected**

Run: `npx tsc --noEmit`
Expected: new errors in `src/components/EntityDetail.tsx`, `EntityDetail.test.tsx`, `EntityPanel.tsx`, `EntityPanel.test.tsx`, and `src/hooks/useTauri.ts` (object literals missing the now-required `entity_id` field, and `entity_type_id: entity.entity_type_id` no longer matching the narrowed type in call sites that will change in later tasks). This is expected — those get fixed in Tasks 7–11.

- [ ] **Step 3: Commit**

```bash
git add src/types/core.ts
git commit -m "Add entity_id to FieldDefinition type; entity_type_id becomes nullable"
```

---

## Task 7: Frontend hooks — `useTauri.ts`

**Files:**
- Modify: `src/hooks/useTauri.ts:33-35`

**Interfaces:**
- Consumes: Tauri commands `list_field_definitions_by_type`, `list_field_definitions_by_entity`, `create_field_definition` (Task 5).
- Produces: `invokeListFieldDefinitionsByType(entityTypeId: string)`, `invokeListFieldDefinitionsByEntity(entityId: string)`, `invokeCreateFieldDefinition(req: { entity_id: string; ... })`. Tasks 10 and 11 consume these exact names.

- [ ] **Step 1: Update the wrappers**

In `src/hooks/useTauri.ts`, replace:

```typescript
export async function invokeListFieldDefinitions(entityTypeId: string): Promise<FieldDefinition[]> { return invoke<FieldDefinition[]>("list_field_definitions", { entityTypeId }); }
export async function invokeCreateFieldDefinition(req: { entity_type_id: string; name: string; label: string; field_type: string; options?: string; sort_order?: number }): Promise<FieldDefinition> { return invoke<FieldDefinition>("create_field_definition", { req }); }
```

with:

```typescript
export async function invokeListFieldDefinitionsByType(entityTypeId: string): Promise<FieldDefinition[]> { return invoke<FieldDefinition[]>("list_field_definitions_by_type", { entityTypeId }); }
export async function invokeListFieldDefinitionsByEntity(entityId: string): Promise<FieldDefinition[]> { return invoke<FieldDefinition[]>("list_field_definitions_by_entity", { entityId }); }
export async function invokeCreateFieldDefinition(req: { entity_id: string; name: string; label: string; field_type: string; options?: string; sort_order?: number }): Promise<FieldDefinition> { return invoke<FieldDefinition>("create_field_definition", { req }); }
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useTauri.ts
git commit -m "Split invokeListFieldDefinitions into by-type and by-entity wrappers"
```

(No test run here — `useTauri.ts` has no dedicated test file in this codebase; it's exercised through the component tests in Tasks 10–11. `tsc` will still show errors from the still-unmigrated components until those tasks land.)

---

## Task 8: Frontend store — `appStore.ts`

**Files:**
- Modify: `src/store/appStore.ts` (full file — it is a single dense line per section; see current content)

**Interfaces:**
- Consumes: `FieldDefinition` type (Task 6).
- Produces: `fieldDefinitionsByEntity: Record<string, FieldDefinition[]>`, `setFieldDefinitionsForEntity: (entityId: string, v: FieldDefinition[]) => void`, alongside the existing unchanged `fieldDefinitionsByType`/`setFieldDefinitionsForType`. Tasks 10 and 11 consume these.

- [ ] **Step 1: Add the new state field to the `AppState` interface**

In `src/store/appStore.ts`, in the `interface AppState { ... }` line, find:

```typescript
fieldDefinitionsByType:Record<string,FieldDefinition[]>;
```

and change it to:

```typescript
fieldDefinitionsByType:Record<string,FieldDefinition[]>; fieldDefinitionsByEntity:Record<string,FieldDefinition[]>;
```

Then find, in the same interface declaration:

```typescript
setFieldDefinitionsForType:(typeId:string,v:FieldDefinition[])=>void;
```

and change it to:

```typescript
setFieldDefinitionsForType:(typeId:string,v:FieldDefinition[])=>void; setFieldDefinitionsForEntity:(entityId:string,v:FieldDefinition[])=>void;
```

- [ ] **Step 2: Add the default value**

Find, in the store's initial state object:

```typescript
fieldDefinitionsByType:{},
```

and change it to:

```typescript
fieldDefinitionsByType:{},fieldDefinitionsByEntity:{},
```

- [ ] **Step 3: Add the setter and include the new slice in `resetProjectState`**

Find:

```typescript
setFieldDefinitionsForType:(typeId,v)=>set(s=>({fieldDefinitionsByType:{...s.fieldDefinitionsByType,[typeId]:v}})),
```

and change it to:

```typescript
setFieldDefinitionsForType:(typeId,v)=>set(s=>({fieldDefinitionsByType:{...s.fieldDefinitionsByType,[typeId]:v}})),setFieldDefinitionsForEntity:(entityId,v)=>set(s=>({fieldDefinitionsByEntity:{...s.fieldDefinitionsByEntity,[entityId]:v}})),
```

Find, in `resetProjectState`:

```typescript
resetProjectState:()=>set({rootDocuments:[],childrenMap:{},entityTypes:[],entitiesByType:{},entityFolders:[],rootEntities:[],entitiesByFolder:{},fieldDefinitionsByType:{},relationTypes:[],selectedDocumentId:null,selectedEntityId:null,projectPath:null}),
```

and change it to:

```typescript
resetProjectState:()=>set({rootDocuments:[],childrenMap:{},entityTypes:[],entitiesByType:{},entityFolders:[],rootEntities:[],entitiesByFolder:{},fieldDefinitionsByType:{},fieldDefinitionsByEntity:{},relationTypes:[],selectedDocumentId:null,selectedEntityId:null,projectPath:null}),
```

- [ ] **Step 4: Verify the file still parses (no dedicated store test file exists in this codebase)**

Run: `npx tsc --noEmit 2>&1 | grep appStore`
Expected: no output (no errors originating from `appStore.ts` itself — remaining `tsc` errors are all in the not-yet-migrated components, addressed next).

- [ ] **Step 5: Commit**

```bash
git add src/store/appStore.ts
git commit -m "Add fieldDefinitionsByEntity slice to the app store"
```

---

## Task 9: `EntityDetail.tsx` + `EntityDetail.test.tsx` — merge legacy and entity-scoped properties

**Files:**
- Modify: `src/components/EntityDetail.tsx` (the `AddPropertyForm.submit` payload, and the `EntityDetail` component's store destructuring, `fieldDefs` computation, fetch effect, and the `onDeleted`/`onAdded` callbacks passed to `PropertyRow`/`AddPropertyForm`)
- Modify: `src/components/EntityDetail.test.tsx` (fixture data and any assertions referencing `invokeListFieldDefinitions`/`invokeCreateFieldDefinition` payload shape)

**Interfaces:**
- Consumes: `invokeListFieldDefinitionsByType`, `invokeListFieldDefinitionsByEntity` (Task 7), `fieldDefinitionsByEntity`/`setFieldDefinitionsForEntity` (Task 8), `FieldDefinition.entity_id` (Task 6).
- Produces: nothing new consumed elsewhere — this is a leaf UI component.

- [ ] **Step 1: Update test fixtures to the new `FieldDefinition` shape**

In `src/components/EntityDetail.test.tsx`, `makeFieldDef` currently returns an object without `entity_id`. Update it:

```typescript
function makeFieldDef(field_type: FieldType, overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: "fd1",
    entity_type_id: null,
    entity_id: "e1",
    name: "test_field",
    label: "Test Field",
    field_type,
    options: null,
    default_value: null,
    is_required: false,
    visibility: "private",
    sort_order: 0,
    created_at: "2026-01-01",
    deleted_at: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test for merged legacy + entity-scoped listing**

In `src/components/EntityDetail.test.tsx`, update the `vi.mock("../hooks/useTauri", ...)` block to mock both new names instead of the old one — replace:

```typescript
vi.mock("../hooks/useTauri", () => ({
  invokeSetFieldValue: vi.fn(),
  invokeDeleteFieldDefinition: vi.fn(),
  invokeGetFieldValues: vi.fn(),
  invokeListFieldDefinitions: vi.fn(),
  invokeCreateFieldDefinition: vi.fn(),
  invokeUpdateEntity: vi.fn(),
  invokeAddEntityAsset: vi.fn(),
  invokeReadEntityAsset: vi.fn(),
  invokeDeleteEntityAsset: vi.fn(),
  invokeListEntityAssets: vi.fn(),
}));
```

with:

```typescript
vi.mock("../hooks/useTauri", () => ({
  invokeSetFieldValue: vi.fn(),
  invokeDeleteFieldDefinition: vi.fn(),
  invokeGetFieldValues: vi.fn(),
  invokeListFieldDefinitionsByType: vi.fn(),
  invokeListFieldDefinitionsByEntity: vi.fn(),
  invokeCreateFieldDefinition: vi.fn(),
  invokeUpdateEntity: vi.fn(),
  invokeAddEntityAsset: vi.fn(),
  invokeReadEntityAsset: vi.fn(),
  invokeDeleteEntityAsset: vi.fn(),
  invokeListEntityAssets: vi.fn(),
}));
```

This file's existing tests all render `<PropertyRow>` directly (not `<EntityDetail>`), so they don't call `invokeGetFieldValues`, `invokeListFieldDefinitionsByType`, `invokeListFieldDefinitionsByEntity`, or `invokeListEntityAssets` at all today — those four are mocked in the factory above but never individually imported/aliased, since no existing test needs to control their resolved value. The new test below is the first in this file to render `<EntityDetail>`, so it needs all four wired up, plus `useAppStore` and `EntityDetail` itself, none of which are currently imported.

Replace the existing second import block:

```typescript
import {
  invokeSetFieldValue,
  invokeDeleteFieldDefinition,
  invokeAddEntityAsset,
  invokeReadEntityAsset,
  invokeDeleteEntityAsset,
} from "../hooks/useTauri";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";

const mockSetFieldValue = invokeSetFieldValue as ReturnType<typeof vi.fn>;
const mockDeleteFieldDefinition = invokeDeleteFieldDefinition as ReturnType<typeof vi.fn>;
const mockAddEntityAsset = invokeAddEntityAsset as ReturnType<typeof vi.fn>;
const mockReadEntityAsset = invokeReadEntityAsset as ReturnType<typeof vi.fn>;
const mockDeleteEntityAsset = invokeDeleteEntityAsset as ReturnType<typeof vi.fn>;
const mockDialogOpen = dialogOpen as ReturnType<typeof vi.fn>;
```

with:

```typescript
import {
  invokeSetFieldValue,
  invokeDeleteFieldDefinition,
  invokeAddEntityAsset,
  invokeReadEntityAsset,
  invokeDeleteEntityAsset,
  invokeGetFieldValues,
  invokeListFieldDefinitionsByType,
  invokeListFieldDefinitionsByEntity,
  invokeListEntityAssets,
} from "../hooks/useTauri";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store/appStore";

const mockSetFieldValue = invokeSetFieldValue as ReturnType<typeof vi.fn>;
const mockDeleteFieldDefinition = invokeDeleteFieldDefinition as ReturnType<typeof vi.fn>;
const mockAddEntityAsset = invokeAddEntityAsset as ReturnType<typeof vi.fn>;
const mockReadEntityAsset = invokeReadEntityAsset as ReturnType<typeof vi.fn>;
const mockDeleteEntityAsset = invokeDeleteEntityAsset as ReturnType<typeof vi.fn>;
const mockDialogOpen = dialogOpen as ReturnType<typeof vi.fn>;
const mockGetFieldValues = invokeGetFieldValues as ReturnType<typeof vi.fn>;
const mockListFieldDefinitionsByType = invokeListFieldDefinitionsByType as ReturnType<typeof vi.fn>;
const mockListFieldDefinitionsByEntity = invokeListFieldDefinitionsByEntity as ReturnType<typeof vi.fn>;
const mockListEntityAssets = invokeListEntityAssets as ReturnType<typeof vi.fn>;
```

Also change the existing `import { PropertyRow } from "./EntityDetail";` line near the top of the file to `import { PropertyRow, EntityDetail } from "./EntityDetail";`.

Add one new test at the end of the file (after the last `describe` block, before the final closing of the file) that exercises the merge logic in the full `EntityDetail` component:

```typescript
describe("EntityDetail", () => {
  it("merges legacy type-scoped fields with the entity's own entity-scoped fields", async () => {
    const legacyField = makeFieldDef("text", { id: "fd-legacy", entity_type_id: "et1", entity_id: null, name: "legacy_prop", label: "Legacy Prop" });
    const ownField = makeFieldDef("text", { id: "fd-own", entity_type_id: null, entity_id: "e1", name: "own_prop", label: "Own Prop" });

    mockListFieldDefinitionsByType.mockResolvedValue([legacyField]);
    mockListFieldDefinitionsByEntity.mockResolvedValue([ownField]);
    mockGetFieldValues.mockResolvedValue([]);
    mockListEntityAssets.mockResolvedValue([]);

    useAppStore.setState({
      entityTypes: [{
        id: "et1", project_id: "p1", name: "Character", name_plural: "Characters",
        icon: null, color: "#c9a84c", description: null, is_system: false,
        sort_order: 0, created_at: "2026-01-01", updated_at: "2026-01-01", deleted_at: null,
      }],
      rootEntities: [ENTITY],
      fieldDefinitionsByType: {},
      fieldDefinitionsByEntity: {},
    });

    render(<EntityDetail entityId="e1" />);

    await waitFor(() => {
      expect(screen.getByText("Legacy Prop")).toBeInTheDocument();
      expect(screen.getByText("Own Prop")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/EntityDetail.test.tsx`
Expected: FAIL — `EntityDetail.tsx` still imports `invokeListFieldDefinitions` (doesn't exist) and only reads `fieldDefinitionsByType`, so "Own Prop" never renders.

- [ ] **Step 4: Update `EntityDetail.tsx`**

Replace the import block:

```typescript
import {
  invokeGetFieldValues,
  invokeListFieldDefinitions,
  invokeCreateFieldDefinition,
  invokeDeleteFieldDefinition,
  invokeSetFieldValue,
  invokeUpdateEntity,
  invokeAddEntityAsset,
  invokeReadEntityAsset,
  invokeDeleteEntityAsset,
  invokeListEntityAssets,
} from "../hooks/useTauri";
```

with:

```typescript
import {
  invokeGetFieldValues,
  invokeListFieldDefinitionsByType,
  invokeListFieldDefinitionsByEntity,
  invokeCreateFieldDefinition,
  invokeDeleteFieldDefinition,
  invokeSetFieldValue,
  invokeUpdateEntity,
  invokeAddEntityAsset,
  invokeReadEntityAsset,
  invokeDeleteEntityAsset,
  invokeListEntityAssets,
} from "../hooks/useTauri";
```

In `AddPropertyForm.submit`, replace:

```typescript
      const payload: {
        entity_type_id: string;
        name: string;
        label: string;
        field_type: string;
        options?: string;
      } = {
        entity_type_id: entity.entity_type_id,
        name: trimmed.toLowerCase().replace(/\s+/g, "_"),
        label: trimmed,
        field_type: fieldType,
      };
```

with:

```typescript
      const payload: {
        entity_id: string;
        name: string;
        label: string;
        field_type: string;
        options?: string;
      } = {
        entity_id: entity.id,
        name: trimmed.toLowerCase().replace(/\s+/g, "_"),
        label: trimmed,
        field_type: fieldType,
      };
```

In `EntityDetail`, replace the store destructuring, `fieldDefs` computation, and fetch effect:

```typescript
  const { entityTypes, fieldDefinitionsByType, setFieldDefinitionsForType } = useAppStore();
```

with:

```typescript
  const { entityTypes, fieldDefinitionsByType, setFieldDefinitionsForType, fieldDefinitionsByEntity, setFieldDefinitionsForEntity } = useAppStore();
```

replace:

```typescript
  const fieldDefs: FieldDefinition[] = entity
    ? (fieldDefinitionsByType[entity.entity_type_id] ?? [])
    : [];
```

with:

```typescript
  const fieldDefs: FieldDefinition[] = entity
    ? [
        ...(fieldDefinitionsByType[entity.entity_type_id] ?? []),
        ...(fieldDefinitionsByEntity[entity.id] ?? []),
      ]
    : [];
```

replace:

```typescript
  useEffect(() => {
    if (!entity) return;
    const typeId = entity.entity_type_id;
    if (fieldDefinitionsByType[typeId]) return;
    invokeListFieldDefinitions(typeId)
      .then((defs) => setFieldDefinitionsForType(typeId, defs))
      .catch(console.error);
  }, [entity?.entity_type_id]);
```

with:

```typescript
  useEffect(() => {
    if (!entity) return;
    const typeId = entity.entity_type_id;
    if (!fieldDefinitionsByType[typeId]) {
      invokeListFieldDefinitionsByType(typeId)
        .then((defs) => setFieldDefinitionsForType(typeId, defs))
        .catch(console.error);
    }
    invokeListFieldDefinitionsByEntity(entity.id)
      .then((defs) => setFieldDefinitionsForEntity(entity.id, defs))
      .catch(console.error);
  }, [entity?.entity_type_id, entity?.id]);
```

Finally, replace the `onDeleted`/`onAdded` callbacks:

```typescript
                onDeleted={(id) => {
                  const current = fieldDefinitionsByType[entity.entity_type_id] ?? [];
                  setFieldDefinitionsForType(entity.entity_type_id, current.filter((f) => f.id !== id));
                }}
```

with:

```typescript
                onDeleted={(id) => {
                  const typeList = fieldDefinitionsByType[entity.entity_type_id] ?? [];
                  setFieldDefinitionsForType(entity.entity_type_id, typeList.filter((f) => f.id !== id));
                  const entityList = fieldDefinitionsByEntity[entity.id] ?? [];
                  setFieldDefinitionsForEntity(entity.id, entityList.filter((f) => f.id !== id));
                }}
```

and:

```typescript
        <AddPropertyForm
          entity={entity}
          onAdded={(fd) => {
            const current = fieldDefinitionsByType[entity.entity_type_id] ?? [];
            setFieldDefinitionsForType(entity.entity_type_id, [...current, fd]);
          }}
        />
```

with:

```typescript
        <AddPropertyForm
          entity={entity}
          onAdded={(fd) => {
            const current = fieldDefinitionsByEntity[entity.id] ?? [];
            setFieldDefinitionsForEntity(entity.id, [...current, fd]);
          }}
        />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/EntityDetail.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 6: Commit**

```bash
git add src/components/EntityDetail.tsx src/components/EntityDetail.test.tsx
git commit -m "EntityDetail: merge legacy type-scoped and entity-scoped properties"
```

---

## Task 10: `EntityPanel.tsx` + `EntityPanel.test.tsx` — same merge, read-only

**Files:**
- Modify: `src/components/EntityPanel.tsx` (store destructuring, `fieldDefs` computation, fetch effect)
- Modify: `src/components/EntityPanel.test.tsx` (mock names, fixture data)

**Interfaces:**
- Consumes: same as Task 9.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Update the mock and fixtures in the test file**

In `src/components/EntityPanel.test.tsx`, replace:

```typescript
vi.mock("../hooks/useTauri", () => ({
  invokeGetFieldValues: vi.fn(),
  invokeListFieldDefinitions: vi.fn(),
  invokeListEntityAssets: vi.fn(),
  invokeReadEntityAsset: vi.fn(),
  invokeListRelationTypes: vi.fn(),
  invokeListOutgoingRelations: vi.fn(),
  invokeListIncomingRelations: vi.fn(),
}));

import {
  invokeGetFieldValues,
  invokeListFieldDefinitions,
  invokeListEntityAssets,
  invokeReadEntityAsset,
  invokeListRelationTypes,
  invokeListOutgoingRelations,
  invokeListIncomingRelations,
} from "../hooks/useTauri";

const mockGetFieldValues = invokeGetFieldValues as ReturnType<typeof vi.fn>;
const mockListFieldDefinitions = invokeListFieldDefinitions as ReturnType<typeof vi.fn>;
```

with:

```typescript
vi.mock("../hooks/useTauri", () => ({
  invokeGetFieldValues: vi.fn(),
  invokeListFieldDefinitionsByType: vi.fn(),
  invokeListFieldDefinitionsByEntity: vi.fn(),
  invokeListEntityAssets: vi.fn(),
  invokeReadEntityAsset: vi.fn(),
  invokeListRelationTypes: vi.fn(),
  invokeListOutgoingRelations: vi.fn(),
  invokeListIncomingRelations: vi.fn(),
}));

import {
  invokeGetFieldValues,
  invokeListFieldDefinitionsByType,
  invokeListFieldDefinitionsByEntity,
  invokeListEntityAssets,
  invokeReadEntityAsset,
  invokeListRelationTypes,
  invokeListOutgoingRelations,
  invokeListIncomingRelations,
} from "../hooks/useTauri";

const mockGetFieldValues = invokeGetFieldValues as ReturnType<typeof vi.fn>;
const mockListFieldDefinitionsByType = invokeListFieldDefinitionsByType as ReturnType<typeof vi.fn>;
const mockListFieldDefinitionsByEntity = invokeListFieldDefinitionsByEntity as ReturnType<typeof vi.fn>;
```

There is exactly one other use of `mockListFieldDefinitions` in this file, in the shared `beforeEach` (currently around line 145-154):

```typescript
describe("EntityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    mockGetFieldValues.mockResolvedValue([]);
    mockListFieldDefinitions.mockResolvedValue([]);
    mockListEntityAssets.mockResolvedValue([]);
    mockListRelationTypes.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([]);
    mockListIncoming.mockResolvedValue([]);
  });
```

Replace the `mockListFieldDefinitions.mockResolvedValue([]);` line with **both** of the following (the component now unconditionally calls both, so both need a resolved-promise default or the two existing image-field tests below will throw on `.then()` of an unmocked call):

```typescript
    mockListFieldDefinitionsByType.mockResolvedValue([]);
    mockListFieldDefinitionsByEntity.mockResolvedValue([]);
```

Update `IMAGE_FIELD_DEF` (the only `FieldDefinition` object literal in this file, around line 66) to include `entity_id: null` alongside its existing `entity_type_id: "et1"`, matching the new type shape — it is otherwise unchanged and is still referenced as-is by the two existing tests (`fieldDefinitionsByType: { et1: [IMAGE_FIELD_DEF] }` at the two call sites around lines 163 and 181, which need no other change since those tests are only exercising the legacy path, which stays covered by the `mockListFieldDefinitionsByType` default of `[]}` plus the explicit `fieldDefinitionsByType` store seed).

- [ ] **Step 2: Write the failing test for merged listing**

Add a new test in the existing `describe` block (find its name by reading the file's structure first) alongside the other rendering tests:

```typescript
  it("merges legacy type-scoped fields with the entity's own entity-scoped fields", async () => {
    const legacyField: FieldDefinition = { ...IMAGE_FIELD_DEF, id: "fd-legacy", entity_type_id: "et1", entity_id: null, field_type: "text", name: "legacy_prop", label: "Legacy Prop" };
    const ownField: FieldDefinition = { ...IMAGE_FIELD_DEF, id: "fd-own", entity_type_id: null, entity_id: "e1", field_type: "text", name: "own_prop", label: "Own Prop" };

    mockListFieldDefinitionsByType.mockResolvedValue([legacyField]);
    mockListFieldDefinitionsByEntity.mockResolvedValue([ownField]);
    mockGetFieldValues.mockResolvedValue([
      { id: "fv1", entity_id: "e1", field_def_id: "fd-legacy", value_text: "a", value_number: null, value_boolean: null, value_date: null, value_json: null, updated_at: "2026-01-01" },
      { id: "fv2", entity_id: "e1", field_def_id: "fd-own", value_text: "b", value_number: null, value_boolean: null, value_date: null, value_json: null, updated_at: "2026-01-01" },
    ]);
    mockListEntityAssets.mockResolvedValue([]);

    useAppStore.setState({
      selectedEntityId: "e1",
      entityTypes: [ENTITY_TYPE],
      rootEntities: [ENTITY],
      fieldDefinitionsByType: {},
      fieldDefinitionsByEntity: {},
    });

    render(<EntityPanel />);

    await waitFor(() => {
      expect(screen.getByText("Legacy Prop")).toBeInTheDocument();
      expect(screen.getByText("Own Prop")).toBeInTheDocument();
    });
  });
```

Check the top of the file for whether `useAppStore` is already imported (it likely is not, since `EntityPanel.tsx` reads it only via the component under test) — add `import { useAppStore } from "../store/appStore";` if missing.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/EntityPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Update `EntityPanel.tsx`**

Replace the import block:

```typescript
import {
  invokeGetFieldValues,
  invokeListFieldDefinitions,
  invokeListEntityAssets,
  invokeReadEntityAsset,
  invokeListRelationTypes,
  invokeListOutgoingRelations,
  invokeListIncomingRelations,
} from "../hooks/useTauri";
```

with:

```typescript
import {
  invokeGetFieldValues,
  invokeListFieldDefinitionsByType,
  invokeListFieldDefinitionsByEntity,
  invokeListEntityAssets,
  invokeReadEntityAsset,
  invokeListRelationTypes,
  invokeListOutgoingRelations,
  invokeListIncomingRelations,
} from "../hooks/useTauri";
```

Replace the store destructuring:

```typescript
  const {
    selectedEntityId,
    setSelectedEntityId,
    setActiveView,
    entityTypes,
    fieldDefinitionsByType,
    setFieldDefinitionsForType,
    projectId,
    relationTypes,
    setRelationTypes,
  } = useAppStore();
```

with:

```typescript
  const {
    selectedEntityId,
    setSelectedEntityId,
    setActiveView,
    entityTypes,
    fieldDefinitionsByType,
    setFieldDefinitionsForType,
    fieldDefinitionsByEntity,
    setFieldDefinitionsForEntity,
    projectId,
    relationTypes,
    setRelationTypes,
  } = useAppStore();
```

Replace the `fieldDefs` computation:

```typescript
  const fieldDefs: FieldDefinition[] = entity
    ? (fieldDefinitionsByType[entity.entity_type_id] ?? [])
    : [];
```

with:

```typescript
  const fieldDefs: FieldDefinition[] = entity
    ? [
        ...(fieldDefinitionsByType[entity.entity_type_id] ?? []),
        ...(fieldDefinitionsByEntity[entity.id] ?? []),
      ]
    : [];
```

Replace the fetch effect:

```typescript
  useEffect(() => {
    if (!entity) return;
    const typeId = entity.entity_type_id;
    if (!fieldDefinitionsByType[typeId]) {
      invokeListFieldDefinitions(typeId)
        .then((defs) => setFieldDefinitionsForType(typeId, defs))
        .catch(console.error);
    }
  }, [entity?.entity_type_id]);
```

with:

```typescript
  useEffect(() => {
    if (!entity) return;
    const typeId = entity.entity_type_id;
    if (!fieldDefinitionsByType[typeId]) {
      invokeListFieldDefinitionsByType(typeId)
        .then((defs) => setFieldDefinitionsForType(typeId, defs))
        .catch(console.error);
    }
    invokeListFieldDefinitionsByEntity(entity.id)
      .then((defs) => setFieldDefinitionsForEntity(entity.id, defs))
      .catch(console.error);
  }, [entity?.entity_type_id, entity?.id]);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/EntityPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/EntityPanel.tsx src/components/EntityPanel.test.tsx
git commit -m "EntityPanel: merge legacy type-scoped and entity-scoped properties"
```

---

## Task 11: Full-project verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Run the full backend suite**

Run: `cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt -- --check`
Expected: all PASS/clean.

- [ ] **Step 2: Run the full frontend suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: `vitest` all PASS. `tsc` shows only the single pre-existing, unrelated `ProjectLibrary.tsx` unused-import error (`'Download' is declared but its value is never read`) — confirm no other errors remain.

- [ ] **Step 3: Manual check — existing project stays untouched, new entities get defaults**

This cannot be scripted; do it by hand:
1. `npm run tauri dev`.
2. Open an existing project whose "Character" entity type predates this feature (0 fields today). Confirm its existing entities still show exactly the properties they showed before.
3. Create a new Character entity in that same project. Confirm it shows the 6 default properties (Birth Date, Height, Eye Color, Occupation, Personality, Alive) and that other, older Character entities in the same project are unaffected.
4. Create a second new Character entity. Delete one of its properties. Confirm the first new entity's properties are unaffected.
5. Create a brand new project. Confirm entity types list includes "Entity". Create an entity of type "Entity" and confirm it has zero properties, and an entity of type "Character" and confirm it has the 6 defaults.

- [ ] **Step 4: Final commit (if the manual check surfaced no changes) or fix-up commit (if it did)**

If everything in Step 3 matches expectations, there's nothing left to commit — Tasks 1–10 already committed the full change. If the manual check surfaces a bug, fix it, re-run Steps 1–2, and commit the fix with a message describing what was wrong.

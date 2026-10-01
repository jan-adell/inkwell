# Entity-Scoped Properties — Design Spec

**Date:** 2026-09-27
**Branch:** feature/entity_defaults
**Status:** Approved for implementation

---

## Problem

Today, `field_definitions` (an entity's custom properties — Birth Date, Height, etc.) belong to an **entity type** (`field_definitions.entity_type_id`), and every entity sharing that type shares the exact same property list. This means:

- Two entities of "Character" are structurally forced to have identical properties.
- "Default properties per entity type" (Birth Date/Height/... for Character, etc.) can only be applied by writing rows onto the shared type — which either has to happen once at type-creation time (defaults never reach entities created afterward if the type already existed) or via some ongoing sync mechanism that keeps rewriting the type's shared schema (risking touching data in projects that already exist).
- `entity_types` ends up carrying real schema responsibility, when conceptually it should be nothing more than a label + color used to group and tint entities in the UI.

The actual requirement: entity types are just a coloring/grouping attribute. Properties belong to the individual entity. The application ships a static, hardcoded catalog of default properties per recognized type name (Character, Location, Item, Event, Organization — "Entity" intentionally has none). When a new entity is created, the app copies that catalog's fields onto **that one entity**, exactly as if the user had typed them in by hand via "Add Property." From that point on, the entity's properties are its own — add/remove freely, with zero effect on any other entity, including other entities that happen to share the same type name.

Existing data must never be touched: every `field_definitions` row that exists today, and every entity's currently-visible properties, must keep working exactly as they do now, indefinitely.

---

## Scope

1. New entity-scoped property mechanism: `field_definitions` can belong to an `entity_id` instead of an `entity_type_id`.
2. Existing entity-type-scoped rows are left completely alone — read-only legacy support, forever. No migration/cloning of existing data (per explicit instruction: never touch existing entities, and no ongoing sync mechanism).
3. All **new** property creation — both the default-property automatism and the manual "Add Property" UI action — creates entity-scoped rows from now on. The entity-type-scoped creation path is retired (not deleted from the schema, just never written to again).
4. A static application-level catalog (already written, moves location) drives which default properties a newly created entity gets, keyed by its entity type's **name**.
5. `entity_type_repo::seed_defaults()` reverts to only ensuring the 6 default entity type rows (name/plural/color) exist — it stops creating any field_definitions, since type-level default fields are no longer a concept.
6. Frontend property editor merges legacy type-scoped fields (if any exist for that entity's type) with the entity's own entity-scoped fields when displaying one entity's properties.

**Non-goals:** no UI for creating custom entity types (built and reverted earlier; out of scope here). No migration of pre-existing type-scoped fields into per-entity clones. No change to relations, entity folders, or any other subsystem.

---

## Data Model

### Migration 006

SQLite can't add a cross-column `CHECK` via `ALTER TABLE ADD COLUMN`, and the existing unique index needs to become two partial indexes, so this migration rebuilds `field_definitions`, following the same table-rebuild pattern already used in migration 005.

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

-- Legacy uniqueness, unchanged in meaning: one active name per entity type.
CREATE UNIQUE INDEX idx_field_definitions_active_name_by_type
    ON field_definitions(entity_type_id, name)
    WHERE deleted_at IS NULL AND entity_type_id IS NOT NULL;

-- New uniqueness: one active name per entity.
CREATE UNIQUE INDEX idx_field_definitions_active_name_by_entity
    ON field_definitions(entity_id, name)
    WHERE deleted_at IS NULL AND entity_id IS NOT NULL;
```

Every row that exists before this migration has `entity_type_id NOT NULL`, so it trivially satisfies the new `CHECK` with `entity_id = NULL` — this migration changes no visible behavior for any existing row.

---

## Backend Changes

### `models/field_definition.rs`

```rust
pub struct FieldDefinition {
    pub id: String,
    pub entity_type_id: Option<String>,  // legacy rows only; always None going forward
    pub entity_id: Option<String>,       // the owning entity for all new rows
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
    pub is_required: bool,
    pub visibility: String,
    pub sort_order: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

pub struct CreateFieldDefinitionRequest {
    pub entity_id: String,   // creation is always entity-scoped now
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub options: Option<String>,
    pub default_value: Option<String>,
    pub is_required: Option<bool>,
    pub visibility: Option<String>,
    pub sort_order: Option<i64>,
}
```

`UpdateFieldDefinitionRequest` is unchanged — updates/deletes are already row-id-based and don't care which owner column is set.

### `db/field_definition_repo.rs`

- `create()`: inserts with `entity_id` set, `entity_type_id = NULL`. Validation (`field_type`, `visibility`) unchanged.
- `list(conn, entity_type_id)` → renamed `list_by_entity_type(conn, entity_type_id)`: unchanged query, kept solely to serve legacy rows.
- New `list_by_entity(conn, entity_id)`: `WHERE entity_id = ?1 AND deleted_at IS NULL ORDER BY sort_order ASC, label ASC` — same shape as the existing query, filtered on the new column.
- `get`, `update`, `delete`: unchanged (id-based).

### New module: `db/default_properties.rs`

The `DefaultField` struct, `field`/`field_with_options` helpers, and the five `CHARACTER_FIELDS`/`LOCATION_FIELDS`/`ITEM_FIELDS`/`EVENT_FIELDS`/`ORGANIZATION_FIELDS` consts + `default_fields_for(name)` move out of `entity_type_repo.rs` into this new module unchanged — they're no longer specific to entity-type seeding, they're the application-level default-properties catalog, consumed by entity creation instead.

### `db/entity_repo.rs::create`

After inserting the entity row, look up its entity type's `name` (already-available `entity_type_repo::get`) and, for each `DefaultField` in `default_properties::default_fields_for(name)`, call `field_definition_repo::create` with `entity_id` = the new entity's id. This is the one and only place default properties get applied — never at type-creation time, never retroactively.

`entity_repo::delete` (soft delete) is unchanged and does not cascade to the entity's field_definitions, matching existing convention — soft-deleting an entity today already doesn't clean up its `field_values` or `entity_assets` either. The orphaned rows are inert (nothing lists fields for an entity the UI can no longer show).

### `db/entity_type_repo.rs::seed_defaults`

Reverts to its pre-default-fields form: for each of the 6 recognized names not already present in the project (by name, as it works today), create the entity type row only. No field seeding — that responsibility moves entirely to `entity_repo::create`.

### Commands

- `commands/field_definitions.rs`: `list_field_definitions` param renamed to match repo split — expose both `list_field_definitions_by_type(entity_type_id)` (legacy) and `list_field_definitions_by_entity(entity_id)` (new); `create_field_definition` request drops `entity_type_id`, requires `entity_id`.
- `commands/entities.rs::create_entity`: no signature change — the default-property application lives in `entity_repo::create`, which this command already calls.

---

## Frontend Changes

- `src/types/core.ts`: `FieldDefinition.entity_type_id: string` → `entity_type_id: string | null`; add `entity_id: string | null`.
- `src/hooks/useTauri.ts`: `invokeListFieldDefinitions(entityTypeId)` → `invokeListFieldDefinitionsByType(entityTypeId)` (unchanged behavior, renamed for clarity) + new `invokeListFieldDefinitionsByEntity(entityId)`; `invokeCreateFieldDefinition` request's `entity_type_id` → `entity_id`.
- `src/store/appStore.ts`: keep `fieldDefinitionsByType` (legacy cache, unchanged), add `fieldDefinitionsByEntity: Record<string, FieldDefinition[]>` + `setFieldDefinitionsForEntity`.
- `src/components/EntityDetail.tsx`: the fetch-on-view effect (currently keyed on `entity.entity_type_id` alone) fetches **both** the legacy type-scoped list (cached per type, as today) and the entity-scoped list (cached per entity, new) for the entity being viewed, and the rendered `properties` array is their concatenation (legacy first, then the entity's own, each internally sorted by `sort_order`). "Add Property" always creates with `entity_id`; "Delete Property" removes from whichever list (by id — the UI doesn't need to know or care which owner column a given row has, since delete is already id-based; it just needs to remove that id from whichever local cache currently holds it).

---

## Testing

- `db/default_properties.rs`: unit tests moved/adapted from the current `entity_type_repo.rs` field-content tests (Character's exact 6-field list, etc.) — pure data assertions on `default_fields_for`.
- `db/entity_type_repo.rs`: existing `seed_defaults` tests trimmed back to type-existence-only assertions (no more field-count tests here).
- `db/entity_repo.rs`: new tests — creating a Character entity gives it 6 entity-scoped field_definitions; creating a second Character entity gives it its own independent 6 (different ids); deleting a field on one entity does not affect the other; creating an "Entity"-typed entity gives zero fields; an entity of a custom/unrecognized type name gives zero fields.
- `db/field_definition_repo.rs`: new tests for `list_by_entity`, and that the same `name` can be reused across two different entities (partial unique index scoped correctly), while still being rejected as a duplicate within the same entity.
- A migration-level test confirming a database seeded via migration 001-005 (with existing entity-type-scoped field_definitions) still lists identically via `list_by_entity_type` after migration 006 runs.
- Frontend: `EntityDetail.test.tsx` updated so property listing/creation exercise `entity_id`-based requests; a test asserting two entities of the same type can show different property sets.

---

## Verification

1. `cargo test` (backend) and `npx vitest run` (frontend) both green; `cargo clippy -- -D warnings`, `cargo fmt --check`, `npx tsc --noEmit` clean (aside from the pre-existing unrelated `ProjectLibrary.tsx` warning noted earlier in this work).
2. Manual check in a **pre-existing** project (like the user's current one): existing Character/Location/etc. entities and their current (empty) property lists are unchanged after upgrading; creating a *new* Character entity in that same project now shows the 6 default properties on that entity only — sibling, pre-existing Characters remain untouched.
3. Manual check in a **new** project: entity types list shows all 6 names including "Entity"; creating entities of each named type shows the right defaults on that entity; creating two Characters and editing one's properties doesn't affect the other's.

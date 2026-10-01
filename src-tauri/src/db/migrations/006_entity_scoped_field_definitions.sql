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

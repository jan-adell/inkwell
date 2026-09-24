-- Migration 005: relations_unique_active_only
--
-- The original UNIQUE(source_entity_id, relation_type_id, target_entity_id)
-- constraint on `relations` applies to ALL rows, including soft-deleted ones.
-- That means deleting a relation and then re-creating the exact same one
-- fails with "this relation already exists", because the old soft-deleted
-- row is still physically present and still counts toward the constraint.
--
-- Fix: recreate the table without the inline UNIQUE (SQLite has no ALTER
-- TABLE DROP CONSTRAINT), and replace it with a partial unique index that
-- only covers active rows — matching what the original schema comment
-- actually intended ("UNIQUE prevents exact duplicate active relations").

CREATE TABLE relations_new (
    id                TEXT    NOT NULL PRIMARY KEY,
    project_id        TEXT    NOT NULL REFERENCES projects(id),
    source_entity_id  TEXT    NOT NULL REFERENCES entities(id),
    relation_type_id  TEXT    NOT NULL REFERENCES relation_types(id),
    target_entity_id  TEXT    NOT NULL REFERENCES entities(id),
    notes             TEXT,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL,
    deleted_at        TEXT
);

INSERT INTO relations_new
    (id, project_id, source_entity_id, relation_type_id, target_entity_id,
     notes, sort_order, created_at, deleted_at)
SELECT
    id, project_id, source_entity_id, relation_type_id, target_entity_id,
    notes, sort_order, created_at, deleted_at
FROM relations;

DROP TABLE relations;

ALTER TABLE relations_new RENAME TO relations;

CREATE UNIQUE INDEX idx_relations_unique_active
    ON relations(source_entity_id, relation_type_id, target_entity_id)
    WHERE deleted_at IS NULL;

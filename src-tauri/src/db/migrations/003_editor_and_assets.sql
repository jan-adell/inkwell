-- Migration 003: editor content inline + entity assets
--
-- Adds notes columns to entities (inline TipTap JSON, no separate blob file)
-- and a junction table for multiple images per entity.
--
-- blob_path on document_contents and bio_blob_path on entities remain in the
-- schema (additive migrations only) but are no longer written by the app.

ALTER TABLE entities ADD COLUMN notes_json TEXT;
ALTER TABLE entities ADD COLUMN notes_text TEXT;

CREATE TABLE entity_assets (
    id            TEXT    NOT NULL PRIMARY KEY,
    entity_id     TEXT    NOT NULL REFERENCES entities(id),
    relative_path TEXT    NOT NULL,
    label         TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL
);

CREATE INDEX idx_entity_assets_entity ON entity_assets(entity_id);

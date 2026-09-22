CREATE TABLE entity_folders (
    id         TEXT NOT NULL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX idx_entity_folders_project ON entity_folders(project_id);

ALTER TABLE entities ADD COLUMN folder_id TEXT REFERENCES entity_folders(id);

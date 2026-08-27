-- =============================================================================
-- INKWELL — Migration 001: Initial Schema
-- =============================================================================
--
-- Tables (in FK dependency order):
--   projects, entity_types, field_definitions, entities, field_values,
--   relation_types, relations, documents, document_contents,
--   document_entity_refs
--
-- FTS5 virtual tables:
--   fts_documents, fts_entities
--
-- Indexes: exactly as defined in Architecture Lock, plus
--   idx_field_definitions_active_name (partial unique, approved in final review)
--
-- NOT included (future migrations):
--   maps, map_pins, calendars, timeline_dates,
--   snapshots, publications, publication_readers, imported_feedback
--
-- Conventions:
--   IDs        TEXT (ULID, 26 chars) — never INTEGER AUTOINCREMENT
--   Timestamps TEXT, ISO 8601, UTC
--   Booleans   INTEGER (0 / 1) — SQLite has no native BOOL type
--   JSON       TEXT — SQLite has no native JSON type; JSON functions work on TEXT
--   Soft delete via deleted_at TEXT (NULL = active)
--
-- schema_migrations is created by ensure_migrations_table() before this
-- migration runs and must NOT be recreated here.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- projects
-- Root anchor for all project data. One .inkwell folder = one project row.
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
    id          TEXT NOT NULL PRIMARY KEY,  -- ULID
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL,              -- ISO 8601 UTC
    updated_at  TEXT NOT NULL,              -- ISO 8601 UTC
    settings    TEXT                        -- JSON: project-level preferences
);


-- ---------------------------------------------------------------------------
-- entity_types
-- User-definable categories: "Personaje", "Dios", "Nave espacial"…
-- is_system = 1 marks built-in types the user cannot delete.
-- ---------------------------------------------------------------------------
CREATE TABLE entity_types (
    id          TEXT    NOT NULL PRIMARY KEY,  -- ULID
    project_id  TEXT    NOT NULL REFERENCES projects(id),
    name        TEXT    NOT NULL,
    name_plural TEXT,
    icon        TEXT,                          -- Lucide icon name
    color       TEXT,                          -- hex color for UI
    description TEXT,
    is_system   INTEGER NOT NULL DEFAULT 0,    -- 1 = built-in, protected
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    deleted_at  TEXT                           -- NULL = active; soft delete
);


-- ---------------------------------------------------------------------------
-- field_definitions
-- Custom field schema per entity type.
-- visibility controls potential Inkwell Share exposure (does NOT auto-publish).
-- ---------------------------------------------------------------------------
CREATE TABLE field_definitions (
    id              TEXT    NOT NULL PRIMARY KEY,  -- ULID
    entity_type_id  TEXT    NOT NULL REFERENCES entity_types(id),
    name            TEXT    NOT NULL,              -- internal key e.g. "edad"
    label           TEXT    NOT NULL,              -- display label e.g. "Edad"
    field_type      TEXT    NOT NULL,              -- 'text' | 'textarea' | 'number' |
                                                   -- 'boolean' | 'date' | 'select' |
                                                   -- 'multiselect' | 'entity_ref' |
                                                   -- 'url' | 'color'
    options         TEXT,                          -- JSON array for select/multiselect
    default_value   TEXT,
    is_required     INTEGER NOT NULL DEFAULT 0,    -- 1 = required
    visibility      TEXT    NOT NULL DEFAULT 'private',
                                                   -- 'private' | 'beta' | 'public'
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    deleted_at      TEXT                           -- soft delete
);

-- Unique active field name per entity type.
-- Partial index allows reusing a name after soft delete.
CREATE UNIQUE INDEX idx_field_definitions_active_name
    ON field_definitions(entity_type_id, name)
    WHERE deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- entities
-- Concrete world elements: "Kael" (Personaje), "Valthera" (Lugar)…
-- visibility mirrors field_definitions.visibility semantics:
--   does NOT auto-publish; only affects what MAY be included in a Share snapshot.
-- ---------------------------------------------------------------------------
CREATE TABLE entities (
    id              TEXT    NOT NULL PRIMARY KEY,  -- ULID
    project_id      TEXT    NOT NULL REFERENCES projects(id),
    entity_type_id  TEXT    NOT NULL REFERENCES entity_types(id),
    name            TEXT    NOT NULL,
    summary         TEXT,                          -- short text for previews
    cover_image     TEXT,                          -- relative path: assets/…
    visibility      TEXT    NOT NULL DEFAULT 'private',
                                                   -- 'private' | 'beta' | 'public'
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    deleted_at      TEXT                           -- soft delete
);


-- ---------------------------------------------------------------------------
-- field_values
-- Per-entity values for custom fields.
-- Exactly one of the five value columns is non-NULL per row,
-- determined by field_definitions.field_type.
-- Column selection and validation are enforced by the Rust layer.
-- ---------------------------------------------------------------------------
CREATE TABLE field_values (
    id              TEXT NOT NULL PRIMARY KEY,  -- ULID
    entity_id       TEXT NOT NULL REFERENCES entities(id),
    field_def_id    TEXT NOT NULL REFERENCES field_definitions(id),
    value_text      TEXT,     -- text, textarea, select, url, color, entity_ref
    value_number    REAL,     -- number
    value_boolean   INTEGER,  -- boolean: 0 or 1
    value_date      TEXT,     -- ISO 8601 date (comparable as text)
    value_json      TEXT,     -- JSON: multiselect, structured data
    updated_at      TEXT NOT NULL,

    UNIQUE(entity_id, field_def_id)
);


-- ---------------------------------------------------------------------------
-- relation_types
-- User-definable edge labels: "vive_en", "posee", "enemigo_de"…
-- allowed_source_types / allowed_target_types: JSON arrays of entity_type ULIDs,
-- or NULL meaning any type is permitted.
-- ---------------------------------------------------------------------------
CREATE TABLE relation_types (
    id                   TEXT    NOT NULL PRIMARY KEY,  -- ULID
    project_id           TEXT    NOT NULL REFERENCES projects(id),
    name                 TEXT    NOT NULL,              -- e.g. "vive_en"
    label                TEXT    NOT NULL,              -- e.g. "Vive en"
    inverse_name         TEXT,                          -- e.g. "habitante_de"
    inverse_label        TEXT,                          -- e.g. "Habitante de"
    allowed_source_types TEXT,                          -- JSON: [ulid,…] or NULL
    allowed_target_types TEXT,                          -- JSON: [ulid,…] or NULL
    color                TEXT,                          -- hex, for graph view
    is_system            INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT    NOT NULL,
    deleted_at           TEXT                           -- soft delete
);


-- ---------------------------------------------------------------------------
-- relations
-- Directed edges: source → relation_type → target.
-- Backlinks are queries against target_entity_id — no separate table needed.
-- UNIQUE prevents exact duplicate active relations.
-- Soft delete (deleted_at) is the only way to remove a relation;
-- no ON DELETE CASCADE — cascade logic is handled by the Rust layer.
-- ---------------------------------------------------------------------------
CREATE TABLE relations (
    id                TEXT    NOT NULL PRIMARY KEY,  -- ULID
    project_id        TEXT    NOT NULL REFERENCES projects(id),
    source_entity_id  TEXT    NOT NULL REFERENCES entities(id),
    relation_type_id  TEXT    NOT NULL REFERENCES relation_types(id),
    target_entity_id  TEXT    NOT NULL REFERENCES entities(id),
    notes             TEXT,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL,
    deleted_at        TEXT,                          -- soft delete

    UNIQUE(source_entity_id, relation_type_id, target_entity_id)
);


-- ---------------------------------------------------------------------------
-- documents
-- Self-referential tree of writing nodes.
-- parent_id = NULL means root-level node.
-- sort_order controls sibling ordering within the same parent.
-- word_count is cached and recomputed on save by the Rust layer.
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
    id          TEXT    NOT NULL PRIMARY KEY,  -- ULID
    project_id  TEXT    NOT NULL REFERENCES projects(id),
    parent_id   TEXT             REFERENCES documents(id),  -- NULL = root
    node_type   TEXT    NOT NULL
                        CHECK (node_type IN (
                            'novel',
                            'part',
                            'chapter',
                            'scene',
                            'note',
                            'document',
                            'folder'
                        )),
    title       TEXT    NOT NULL,
    synopsis    TEXT,
    status      TEXT    NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('idea', 'draft', 'revision', 'final')),
    word_count  INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_included INTEGER NOT NULL DEFAULT 1,    -- 0 = excluded from compilations
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    deleted_at  TEXT                           -- soft delete
);


-- ---------------------------------------------------------------------------
-- document_contents
-- Separated from documents so the tree loads without fetching content blobs.
-- One-to-one with documents (document_id is both PK and FK).
-- Both rows (documents + document_contents) must be inserted in the same
-- transaction by the Rust layer — no DEFAULT is provided here intentionally.
-- content_json: canonical TipTap/ProseMirror JSON document.
-- content_text: plain text extracted from content_json, used only for FTS5.
-- ---------------------------------------------------------------------------
CREATE TABLE document_contents (
    document_id  TEXT NOT NULL PRIMARY KEY REFERENCES documents(id),
    content_json TEXT NOT NULL,
    content_text TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);


-- ---------------------------------------------------------------------------
-- document_entity_refs
-- Derived index: entity mentions within documents.
-- Source of truth is content_json (entity_mention nodes in TipTap).
-- Fully rebuilt for a document on every save by the Rust layer.
-- Must never be written directly from the UI layer.
-- ---------------------------------------------------------------------------
CREATE TABLE document_entity_refs (
    id          TEXT NOT NULL PRIMARY KEY,  -- ULID
    document_id TEXT NOT NULL REFERENCES documents(id),
    entity_id   TEXT NOT NULL REFERENCES entities(id),
    ref_type    TEXT NOT NULL DEFAULT 'mention',  -- 'mention' | 'tagged'
    created_at  TEXT NOT NULL,

    UNIQUE(document_id, entity_id, ref_type)
);


-- ===========================================================================
-- FTS5 VIRTUAL TABLES
-- Standalone FTS (not content-linked). Updated manually on save by the
-- Rust layer, following the same pattern as document_entity_refs.
-- unicode61 tokenizer handles accented characters and multilingual text.
-- FTS5 is available because rusqlite "bundled" compiles SQLite with
-- -DSQLITE_ENABLE_FTS5 (confirmed in libsqlite3-sys/build.rs v0.31.0).
-- ===========================================================================

CREATE VIRTUAL TABLE fts_documents USING fts5 (
    document_id  UNINDEXED,
    title,
    content_text,
    tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE fts_entities USING fts5 (
    entity_id  UNINDEXED,
    name,
    summary,
    tokenize = 'unicode61'
);


-- ===========================================================================
-- INDEXES
-- Exactly as defined in Architecture Lock.
-- Partial indexes (WHERE deleted_at IS NULL) cover only active rows.
-- ===========================================================================

-- entities: list all active entities of a given type within a project
CREATE INDEX idx_entities_type_project
    ON entities(project_id, entity_type_id)
    WHERE deleted_at IS NULL;

-- entities: support soft-delete queries (papelera); no WHERE per Architecture Lock
CREATE INDEX idx_entities_deleted
    ON entities(deleted_at);

-- field_values: fetch all values for an entity
CREATE INDEX idx_field_values_entity
    ON field_values(entity_id);

-- relations: forward lookup — "what does this entity relate to?"
CREATE INDEX idx_relations_source
    ON relations(source_entity_id)
    WHERE deleted_at IS NULL;

-- relations: reverse/backlink lookup — "what relates to this entity?"
CREATE INDEX idx_relations_target
    ON relations(target_entity_id)
    WHERE deleted_at IS NULL;

-- relations: filter by relation type
CREATE INDEX idx_relations_type
    ON relations(relation_type_id)
    WHERE deleted_at IS NULL;

-- documents: fetch children of a node (tree navigation)
CREATE INDEX idx_documents_parent
    ON documents(parent_id)
    WHERE deleted_at IS NULL;

-- documents: fetch all nodes for a project
CREATE INDEX idx_documents_project
    ON documents(project_id)
    WHERE deleted_at IS NULL;

-- document_entity_refs: "which entities appear in this document?"
CREATE INDEX idx_doc_refs_document
    ON document_entity_refs(document_id);

-- document_entity_refs: "in which documents does this entity appear?" (backlinks)
CREATE INDEX idx_doc_refs_entity
    ON document_entity_refs(entity_id);

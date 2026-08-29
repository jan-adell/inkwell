# Editor & Entity Assets — Design Spec

**Date:** 2026-08-29  
**Branch:** feature/persitance  
**Status:** Approved for implementation

---

## Problem

Inkwell has no text editor. Documents exist in the DB but their content cannot be read or written from the UI. Additionally, entities (characters, locations, etc.) have no notes field and no way to associate images.

---

## Scope

1. Prose editor in the center panel of ProjectShell
2. Entity notes (same editor component, fewer formatting options)
3. Entity asset gallery (multiple images per entity — portraits, maps, etc.)
4. Fix AppState to carry the project path (required for asset file I/O)

---

## Storage Architecture

### Text content — inline SQLite

`document_contents` already has `content_json TEXT NOT NULL` (migration 001). The `blob_path` column added in migration 002 is superseded and will not be used going forward.

Entity notes require new columns (migration 003):
- `entities.notes_json TEXT` — TipTap JSON
- `entities.notes_text TEXT` — plain text, kept in sync for FTS

### Binary assets — filesystem + DB record

Images (portraits, maps) are large binary files that do not belong in SQLite. Each is stored under the project folder as `assets/<entity-type-plural>/<ulid>.<ext>` and referenced by a row in the new `entity_assets` table.

The existing `blob_store.rs` is used for asset file copy operations. The existing `entities.cover_image` single-image column is superseded by `entity_assets` but not dropped (additive migration).

---

## Migration 003

```sql
-- Entity notes stored inline
ALTER TABLE entities ADD COLUMN notes_json TEXT;
ALTER TABLE entities ADD COLUMN notes_text TEXT;

-- Multiple assets per entity (portraits, maps, etc.)
CREATE TABLE entity_assets (
    id            TEXT    NOT NULL PRIMARY KEY,  -- ULID
    entity_id     TEXT    NOT NULL REFERENCES entities(id),
    relative_path TEXT    NOT NULL,              -- relative to project root
    label         TEXT,                          -- "portrait", "map", free text
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL
);

CREATE INDEX idx_entity_assets_entity ON entity_assets(entity_id);
```

---

## AppState

Add `project_path` alongside the existing DB connection:

```rust
pub struct AppState {
    pub db: Mutex<Connection>,
    pub project_path: Mutex<Option<PathBuf>>,
}
```

`project_path` is set whenever a project is opened, created, or imported, and cleared to `None` when a project is deleted. Commands that need file I/O read it from state rather than recomputing from `app.path().app_data_dir()`.

---

## Backend Commands

### Document content

| Command | Signature | Notes |
|---|---|---|
| `write_document_content` | `(document_id, content_json, content_text) → ()` | Single SQL transaction: UPDATE document_contents + rebuild FTS row |
| `read_document_content` | `(document_id) → String` | Returns `content_json`; returns empty doc JSON if row is new |

Both commands replace `write_document_blob` / `read_document_blob`, which are removed.

### Entity notes

| Command | Signature | Notes |
|---|---|---|
| `write_entity_notes` | `(entity_id, notes_json, notes_text) → ()` | UPDATE entities SET notes_json, notes_text. Does NOT update fts_entities (see below). |
| `read_entity_notes` | `(entity_id) → Option<String>` | Returns `notes_json`; `None` if never written |

> **FTS note:** `fts_entities` has a fixed schema (`name`, `summary`). Adding `notes_text` requires a drop+recreate of the FTS5 virtual table, which is a separate migration. Entity notes are **not** FTS-indexed in this version.

### Entity assets

| Command | Signature | Notes |
|---|---|---|
| `add_entity_asset` | `(entity_id, source_path, label) → EntityAsset` | Copies file into `assets/` under project root via blob_store, inserts DB record |
| `list_entity_assets` | `(entity_id) → Vec<EntityAsset>` | Ordered by `sort_order ASC, created_at ASC` |
| `delete_entity_asset` | `(asset_id) → ()` | Deletes DB record; also removes the file from disk |

### Model

```rust
pub struct EntityAsset {
    pub id: String,
    pub entity_id: String,
    pub relative_path: String,
    pub label: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
}
```

### Asset path resolution

To display an image in the Tauri webview, the frontend uses `convertFileSrc(absolutePath)` from `@tauri-apps/api/core`, which returns a `tauri://localhost/...` URL the webview can load.

`OpenProjectResult` is extended with a `project_path: String` field. The frontend stores this in the Zustand store when a project is opened/created/imported. Asset absolute paths are assembled in the frontend as `projectPath + "/" + relativePath` — no extra Tauri command needed.

---

## Frontend

### RichTextEditor component

```
src/components/RichTextEditor.tsx
```

Props:
```ts
interface RichTextEditorProps {
  mode: 'prose' | 'notes';
  value: string;          // TipTap JSON string; empty doc if ""
  onChange: (json: string, text: string) => void;
  placeholder?: string;
}
```

Extension sets:

| Mode | Extensions |
|---|---|
| `prose` | Document, Text, Paragraph, Heading (H1=chapter title, H2=scene), Bold, Italic |
| `notes` | Document, Text, Paragraph, Bold, Italic |

Auto-save: the parent component debounces `onChange` calls (1 000 ms) and calls the appropriate Tauri command. No save button is shown.

A minimal status indicator ("Saving…" / "Saved") appears in the top-right corner of the editor container. It is subtle (small, muted color) and does not interrupt the writing flow.

### DocumentEditor panel

```
src/components/DocumentEditor.tsx
```

Mounted in the center column of `ProjectShell` when a document node is selected in the sidebar. Loads content with `read_document_content`, renders `<RichTextEditor mode="prose" />`, debounces writes to `write_document_content`.

The panel shows the document title at the top (read-only; edited via sidebar) and a word count in the footer derived from `content_text.split(/\s+/).filter(Boolean).length`.

### Entity detail panel

When an entity is selected, the detail panel shows:

1. Entity fields (existing)
2. `<RichTextEditor mode="notes" />` for the entity's notes
3. Asset gallery: grid of images with an "Add image" button and a delete affordance per image

Image upload flow:
- User clicks "Add image"
- File picker opens (dialog plugin, `image/*` filter)
- Frontend calls `add_entity_asset(entity_id, source_path, label)`
- On success, list is refreshed via `list_entity_assets`

Image display:
- Each `EntityAsset.relative_path` is resolved to an absolute path, then passed through `convertFileSrc()` for display as `<img src={tauriUrl} />`

---

## Auto-save Contract

- Debounce delay: **1 000 ms** after the last `onChange` event
- On unmount: flush any pending save synchronously before teardown
- On error: show a non-blocking toast; do not discard content
- No explicit save button anywhere in the UI

---

## What is NOT in scope

- Collaborative editing
- Inline images inside prose (images are entity-level only)
- Export to DOCX/PDF (separate future feature)
- `blob_path` / `bio_blob_path` migration cleanup (columns stay, are ignored)
- `cover_image` on entities (column stays; superseded by `entity_assets` but not removed)

---

## File Checklist

**Rust (src-tauri/src/):**
- `db/migrations/003_editor_and_assets.sql` — new migration
- `state.rs` — add `project_path` field
- `models/entity_asset.rs` — `EntityAsset` struct
- `models/mod.rs` — pub mod entity_asset
- `db/entity_asset_repo.rs` — insert / list / delete
- `db/mod.rs` — pub mod entity_asset_repo
- `db/document_blob.rs` — update to write `content_json` inline (rename fn or replace)
- `commands/documents.rs` — replace blob commands with content commands
- `commands/entities.rs` — add notes commands
- `commands/assets.rs` — new file for entity asset commands
- `commands/mod.rs` — pub mod assets
- `commands/projects.rs` — set `state.project_path` on open/create/import/delete
- `lib.rs` — register new commands

**Frontend (src/):**
- `components/RichTextEditor.tsx` — new TipTap component
- `components/DocumentEditor.tsx` — prose editor panel
- `hooks/useTauri.ts` — add wrappers for new commands
- `types/core.ts` — add `EntityAsset` type
- Entity detail page — integrate notes editor + asset gallery

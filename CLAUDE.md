# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (Tauri desktop app)
npm run tauri dev

# Build for distribution
npm run tauri build

# Frontend only (no Tauri IPC — invoke() calls will fail)
npm run dev            # http://localhost:1420

# Type-check frontend
npx tsc --noEmit

# Rust: from src-tauri/
cargo test
cargo clippy -- -D warnings
cargo fmt
```

## Architecture

Inkwell is a **Tauri 2** desktop app: React + TypeScript frontend bundled by Vite, Rust backend using SQLite via `rusqlite` (bundled, no system dep required).

### IPC boundary

All frontend → backend calls go through `src/hooks/useTauri.ts`, which wraps Tauri's `invoke()`. There is no other place that calls `invoke()`.

Backend commands are registered in `src-tauri/src/lib.rs` and implemented in `src-tauri/src/commands/` (one file per domain: `core.rs`, `documents.rs`, `entities.rs`, `entity_types.rs`, `relations.rs`, etc.).

### Backend layers

```
commands/   → Tauri IPC boundary (deserialize args, serialize response, call db/ directly)
services/   → Reserved for business logic that outgrows commands/; currently unused —
              every command still calls db/ repos directly (see services/mod.rs)
db/         → SQLite repos (one file per model) + migration runner
models/     → Rust structs (serde + rusqlite mapping)
state.rs    → AppState held by Tauri's managed state (DB connection, current project)
error.rs    → Typed error enum bridged to frontend as serialized strings
```

### Frontend layers

```
src/types/core.ts        → TypeScript types mirroring Rust models (keep in sync manually)
src/hooks/useTauri.ts    → All invoke() wrappers — one function per Tauri command
src/store/appStore.ts    → Single Zustand store (navigation + document tree + worldbuilding data)
src/pages/               → Top-level page components (SplashPage, ProjectLibrary, CreateProject, ProjectShell)
src/components/          → Reusable UI: Sidebar, DocumentEditor/RichTextEditor (TipTap),
                           EntityDetail (entity editor + properties), EntityPanel
                           (read-only entity reference panel), modals
```

### Project file format

A project is a portable folder:
```
MyNovel.inkwell/
├── meta.json      # schema version, ULID project ID, name
├── project.db     # SQLite (WAL mode, FK enforcement)
└── assets/entities/<entity-id>/<ulid>.jpg   # image property files, relative paths only
```

`meta.json` is read before opening the DB so the migration system can detect schema version mismatches without touching data.

### Entity properties (field definitions/values)

Entities have a dynamic schema: `field_definitions` (per entity type) declares which properties
exist and their type (`text`, `textarea`, `number`, `date`, `image`, `entity_ref`, `multiselect`,
...); `field_values` holds one row per entity+field with a type-specific column. Frontend logic
lives in `EntityDetail.tsx` (`PropertyRow`, `AddPropertyForm`) — it's the file most likely to
need touching when adding a new field type or property behavior.

- **Number units**: stored as JSON in `field_definitions.options` (`{"unit":"kg"}`) — no schema
  change needed, see `getNumberUnit`/`SI_UNIT_GROUPS` in `EntityDetail.tsx`.
- **entity_ref / multiselect options**: the referenced entity type's ID, JSON-encoded in
  `field_definitions.options` (`{"entityTypeId":"..."}`) — see `parseEntityTypeIdFromOptions`/
  `encodeEntityTypeOptions`.
- **Image properties** are the one field type NOT stored in `field_values` — see below.

### Entity image properties

Images are stored as rows in `entity_assets` (not `field_values`), linked to their field via
`entity_assets.label = field_definitions.id` (a plain string column reused as a link key, no
migration needed). Backend logic is entirely in `src-tauri/src/commands/assets.rs`:

- **Upload** (`add_entity_asset`): every accepted format (JPEG/PNG/GIF/WebP/BMP/TIFF/SVG) is
  decoded (SVG is rasterized via `resvg`+`tiny-skia`; GIF keeps only its first frame), resized to
  at most 200×200px, and re-encoded as JPEG — PNG is the only format that keeps its own encoder,
  but everything ends up `.jpg` on disk (`output_ext` always returns `"jpg"`). JPEG quality steps
  down (85→70→...→5) until the output fits a 20KB budget; transparency is composited onto white
  first (`flatten_to_white`) since JPEG has no alpha channel.
- **Delivery** (`read_entity_asset`): returns a `data:image/jpeg;base64,...` URL, not a
  `convertFileSrc`/`asset://` URL — Tauri's asset protocol needs scope configuration this project
  doesn't have, so the frontend just asks the backend to read-and-base64 the file over IPC.
- **Path safety** (`ensure_within_project`): canonicalizes the destination and the project root
  before checking `starts_with`, rather than a plain string prefix check — required because
  `canonicalize()` returns the `\\?\`-prefixed extended-length form on Windows, so both sides
  must be canonicalized the same way or the comparison spuriously fails.
- **Cleanup**: deleting an image-type field definition (`delete_field_definition`) also deletes
  every `entity_assets` row/file linked to it via `entity_asset_repo::list_by_label` — otherwise
  the file and DB row are orphaned forever.

### Migrations

SQL migrations live in `src-tauri/src/db/migrations/` as numbered `.sql` files. The runner in `migrations.rs` validates SHA-256 checksums and applies each migration inside a transaction — any failure rolls back completely.

### IDs

All IDs are **ULIDs** (sortable, globally unique). Never use sequential integers or UUIDs.

## Target platforms

Inkwell targets **Linux and Windows**. Every feature must work on both platforms. Platform-specific considerations:

- Use `dragDropEnabled: false` in `tauri.conf.json` — Tauri's native file-drop handler intercepts HTML5 DnD events on Windows (WebView2) and must be disabled for any custom drag-and-drop.
- Do not rely solely on `dataTransfer.getData()` for drag state — WebView2 can return an empty string. Use a Zustand store field as a sidecar (see `draggingId` in `appStore.ts`).
- Avoid CSS or JS that depends on Linux-only rendering behaviour; test visual layouts on both platforms.
- File path separators: always use Tauri's path APIs in the frontend (never hardcode `/`) so
  paths are portable. Exception: relative paths stored in the DB (`entity_assets.relative_path`
  etc.) are always POSIX-style (`assets/entities/...`) by convention — this is a stable, portable
  storage format, reconstructed into a native path via `project_path.join(...)` at the point of
  actual file I/O, which correctly interprets `/` on both platforms.
- Rust path comparisons: never compare a canonicalized path against a non-canonicalized one with
  `starts_with` — canonicalize both sides first. `canonicalize()` returns the `\\?\`-prefixed
  extended-length form on Windows, so a raw/canonical mismatch silently fails the comparison. See
  `ensure_within_project` in `commands/assets.rs`.

## Key constraints

- No network code in the Rust backend — enforced at the dependency level (no HTTP client in `Cargo.toml`).
- Asset paths stored in the DB must always be **relative to the project folder root**.
- TypeScript types in `src/types/core.ts` must stay in sync with Rust models in `src-tauri/src/models/` — there is no codegen.

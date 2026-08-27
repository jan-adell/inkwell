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
commands/   → Tauri IPC boundary (deserialize args, serialize response, call service)
services/   → Business logic; no Tauri imports; independently testable
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
src/components/          → Reusable UI (Sidebar, etc.)
```

### Project file format

A project is a portable folder:
```
MyNovel.inkwell/
├── meta.json      # schema version, ULID project ID, name
├── project.db     # SQLite (WAL mode, FK enforcement)
└── assets/        # characters/, maps/, covers/ — paths stored as relative
```

`meta.json` is read before opening the DB so the migration system can detect schema version mismatches without touching data.

### Migrations

SQL migrations live in `src-tauri/src/db/migrations/` as numbered `.sql` files. The runner in `migrations.rs` validates SHA-256 checksums and applies each migration inside a transaction — any failure rolls back completely.

### IDs

All IDs are **ULIDs** (sortable, globally unique). Never use sequential integers or UUIDs.

## Key constraints

- No network code in the Rust backend — enforced at the dependency level (no HTTP client in `Cargo.toml`).
- Asset paths stored in the DB must always be **relative to the project folder root**.
- TypeScript types in `src/types/core.ts` must stay in sync with Rust models in `src-tauri/src/models/` — there is no codegen.

# INKWELL

**Write. Build. Imagine.**

Inkwell is a local-first application for writers and worldbuilders. It brings together novel writing, worldbuilding, character sheets, relationships, timelines, and maps into a single connected workspace — without requiring an account, a server, or an internet connection.

---

## Philosophy

**Local-first.** Your project lives on your machine as a portable folder. No cloud, no sync, no account required to write.

**Privacy-first.** Inkwell Core has no network access. Nothing leaves your device unless you explicitly use Inkwell Share (a future optional feature). Your stories are yours.

**Portable.** A project is a single folder (`YourProject.inkwell/`) that you can copy, back up, or move to another computer and open immediately.

**No vendor lock-in.** The database format is documented. You can access your data with standard SQLite tools even without Inkwell.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | [Tauri 2](https://tauri.app) |
| Backend | Rust |
| Database | SQLite (WAL mode, via `rusqlite` with bundled feature) |
| IDs | ULID (sortable, globally unique, portable) |
| Frontend | React 18 + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Global state | Zustand |
| Editor | [TipTap](https://tiptap.dev) (rich text, stored as JSON per document) |
| Image processing | `image` + `resvg`/`tiny-skia` (pure Rust, no native deps) |

---

## Project structure

```
inkwell/
├── src/                        # React + TypeScript frontend
│   ├── components/             # Reusable UI components
│   ├── hooks/                  # Tauri IPC wrappers and custom hooks
│   ├── pages/                  # Top-level page components
│   ├── store/                  # Zustand global state
│   └── types/                  # TypeScript types mirroring Rust models
│
└── src-tauri/                  # Rust + Tauri backend
    └── src/
        ├── commands/           # Tauri IPC commands (frontend ↔ backend bridge)
        ├── db/                 # SQLite connection, pragmas, migrations
        │   └── migrations/     # Numbered .sql migration files
        ├── models/             # Rust structs mirroring database tables
        └── services/           # Business logic (no Tauri dependencies)
```

---

## Project file format (`.inkwell`)

A project is a folder:

```
MyNovel.inkwell/
├── meta.json       # Schema version, project ID (ULID), project name
├── project.db      # SQLite database — all content and structure
└── assets/
    └── entities/
        └── <entity-id>/
            └── <ulid>.jpg   # or .png — one file per image property
```

`meta.json` is read before opening the database, so the migration system can detect schema version mismatches before touching any data.

All asset paths stored in the database are **relative to the project folder root** — never absolute. This is what makes projects portable across machines.

**Entity images are reference thumbnails, not artwork storage.** Every image a writer attaches
to an entity property is rasterized, resized to at most 200×200px, and re-encoded as JPEG
(quality reduced automatically until it fits a 20KB budget) at upload time — SVGs and GIFs are
rasterized to a static frame the same way. This keeps a project with hundreds of character/place
images small; if you need to keep the original full-resolution artwork, save it elsewhere.

---

## Development status

- [x] Project structure, SQLite (WAL mode, FK enforcement), migration system
      (SHA-256 checksummed, transactional rollback)
- [x] Typed error handling across the Rust ↔ frontend boundary
- [x] Documents: tree of folders/documents, rich-text editing via TipTap, word
      count, status, synopsis
- [x] Entity system: entity types, one-level entity folders, entities
- [x] Custom entity properties (field definitions/values): text, long text,
      number (with SI unit selector), date, image, entity reference,
      entity-list reference
- [x] Entity image properties: upload, replace, remove; every image is
      rasterized, resized (≤200×200px) and re-encoded to JPEG (≤20KB) so a
      project stays small regardless of the original photo's size or format
- [x] Relations between entities (typed, directional)
- [x] Project export/import (portable `.inkwell` folder as a zip)
- [x] Cross-platform CI: Linux + Windows, Rust + frontend test suites, a
      Windows visual smoke test, and a Windows build check
- [ ] Full-text search (FTS5)
- [ ] Timelines and maps
- [ ] Inkwell Share (future, optional)

---

## Running the project

**Prerequisites:**

- [Rust](https://rustup.rs/) (stable, 1.77+)
- [Node.js](https://nodejs.org/) (18+)
- System dependencies for Tauri: see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

**Development:**

```bash
npm install
npm run tauri dev
```

**Build for distribution:**

```bash
npm run tauri build
```

**Run frontend only (no Tauri, for UI development):**

```bash
npm run dev
# open http://localhost:1420
```

> Note: Running without Tauri means `invoke()` calls will fail.
> The splash screen will show an initialization error, which is expected.

---

## Privacy guarantee

Inkwell Core contains no network code. The Rust backend does not import any HTTP client library. No telemetry, no analytics, no external calls of any kind. This is enforced at the dependency level, not just by policy.

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
| Editor | TipTap (planned — not yet implemented) |

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
    ├── characters/ # Character images
    ├── maps/       # Map images
    └── covers/     # Cover images
```

`meta.json` is read before opening the database, so the migration system can detect schema version mismatches before touching any data.

All asset paths stored in the database are **relative to the project folder root** — never absolute. This is what makes projects portable across machines.

---

## Development status

**Current phase: Foundation (Implementation 001)**

- [x] Project structure
- [x] Tauri 2 + React + TypeScript + Vite wired together
- [x] Tailwind CSS with Inkwell design tokens
- [x] SQLite connection with WAL mode and foreign key enforcement
- [x] Migration system with SHA-256 checksums and transactional rollback
- [x] Error handling (typed errors across Rust ↔ frontend boundary)
- [x] `initialize_core` Tauri command
- [ ] Initial schema migration (Implementation 002)
- [ ] Entity types and entities
- [ ] Documents and writing editor
- [ ] Relations and backlinks
- [ ] Full-text search (FTS5)
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

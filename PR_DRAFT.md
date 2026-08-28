# Draft PR: feat(persistence): add connection manager and repository traits

This branch adds initial persistence abstractions and a small connection
facade to make the codebase easier to test and to follow SOLID principles.

What I added

- src-tauri/src/db/connection_manager.rs
  - ConnectionManager::open(db_path) — opens a SQLite DB and applies required pragmas
  - ConnectionManager::verify(conn) — inspects pragma state
  - Tests that open a temporary DB, run migrations, and verify pragmas

- src-tauri/src/db/persistence.rs
  - ProjectRepository trait
  - SqliteProjectRepository adapter delegating to existing project_repo functions
  - Tests for creating and fetching a Project via the adapter

- Updated src-tauri/src/db/mod.rs to export the new modules.

Why

- Keeps Tauri command initialization small: initialization code can call
  ConnectionManager to open and verify DB state.
- Services should depend on repository interfaces rather than rusqlite directly,
  enabling easier unit testing and a clearer separation of concerns.

Testing instructions

1. Checkout the branch:

   git fetch origin
   git checkout feature/persitance

2. Run the Rust tests for the tauri backend (from repository root):

   cd src-tauri
   cargo test --lib

Notes / next steps

- The ProjectRepository trait is intentionally small — more repo traits (EntityRepo,
  DocumentRepo, RelationRepo, etc.) should be added following the same pattern.
- Consider introducing a simple connection pool (r2d2 + rusqlite) if concurrency
  requirements increase; keep the ConnectionManager as the single place to
  encapsulate pooling logic.


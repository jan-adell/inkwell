use std::path::PathBuf;

use tauri::Manager;

use crate::db::{self, migrations, verify_pragmas};
use crate::error::InkwellError;
use crate::models::ProjectMeta;
use crate::state::AppState;

/// Result returned to the frontend after initialization.
///
/// Serialized to JSON and received in TypeScript as `InitResult`.
/// See: src/types/core.ts
#[derive(Debug, serde::Serialize)]
pub struct InitResult {
    pub ok: bool,
    pub schema_version: u32,
    pub message: String,
    pub pragma_status: Option<db::PragmaStatus>,
}

/// `initialize_core` — the first Tauri command called on startup.
///
/// Called by the frontend's `invokeInitializeCore()` (src/hooks/useTauri.ts).
///
/// What it does:
/// 1. Determines the path for the temporary/default database.
///    (In future phases, the user will choose/open a .inkwell project folder.
///    For foundation phase, we use Tauri's app data directory.)
/// 2. Creates the project folder structure if it doesn't exist.
/// 3. Opens (or creates) the SQLite database.
/// 4. Verifies WAL mode and foreign keys are active.
/// 5. Ensures the schema_migrations table exists.
/// 6. Runs any pending migrations.
/// 7. Writes/updates meta.json.
/// 8. Registers the open Connection as Tauri managed AppState so that
///    CRUD commands can access it without reopening the database.
///
/// Privacy guarantee: no network access. No data leaves the device.
/// All operations are on the local filesystem only.
#[tauri::command]
pub async fn initialize_core(app: tauri::AppHandle) -> Result<InitResult, InkwellError> {
    // --- Step 1: Resolve the database path ---
    //
    // Foundation phase: use Tauri's managed app data directory for a
    // temporary "default" project. This lets us verify the full
    // initialization pipeline without a project picker UI.
    //
    // Implementation 003+ will replace this with an explicit
    // "open/create project" flow where the user selects a .inkwell folder.
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| InkwellError::Filesystem(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Could not resolve app data directory: {e}"),
        )))?;

    // --- Step 2: Create project folder structure ---
    //
    // For the foundation phase, we create a minimal structure inside
    // app_data_dir. In future phases, this becomes the .inkwell folder
    // the user explicitly creates or opens.
    let project_dir = app_data_dir.join("default_project");
    ensure_project_structure(&project_dir)?;

    // --- Step 3: Open (or create) the SQLite database ---
    let db_path = project_dir.join("project.db");
    let mut conn = db::open_database(&db_path)?;

    // --- Step 4: Verify pragmas are correctly applied ---
    let pragma_status = verify_pragmas(&conn)?;

    if !pragma_status.wal_enabled {
        return Ok(InitResult {
            ok: false,
            schema_version: 0,
            message: "WAL mode could not be enabled on the database.".into(),
            pragma_status: Some(pragma_status),
        });
    }

    if !pragma_status.foreign_keys_enabled {
        return Ok(InitResult {
            ok: false,
            schema_version: 0,
            message: "Foreign key enforcement could not be enabled.".into(),
            pragma_status: Some(pragma_status),
        });
    }

    // --- Step 5 & 6: Initialize migrations table and run pending migrations ---
    let schema_version = migrations::run_pending_migrations(&mut conn)?;

    // --- Step 7: Write/update meta.json ---
    write_meta_json(&project_dir, schema_version)?;

    // --- Step 8: Register AppState so CRUD commands can access the connection ---
    //
    // manage() panics if called twice, so we only register if not already set.
    // On hot-reload in development, Tauri may call initialize_core again; the
    // try_state check prevents a double-manage panic.
    if app.try_state::<AppState>().is_none() {
        app.manage(AppState::new(conn, project_dir));
    }

    Ok(InitResult {
        ok: true,
        schema_version,
        message: format!(
            "Core initialized. Schema v{schema_version}. WAL active. FK enforced."
        ),
        pragma_status: Some(pragma_status),
    })
}

/// Create the minimal .inkwell folder structure if it doesn't already exist.
///
/// Foundation phase creates:
///   <project_dir>/
///     assets/
///       characters/
///       maps/
///       covers/
///
/// The `project.db` file is created by SQLite on first open.
/// The `meta.json` file is written by `write_meta_json`.
fn ensure_project_structure(project_dir: &PathBuf) -> Result<(), InkwellError> {
    let dirs = [
        project_dir.as_path(),
        &project_dir.join("assets/characters"),
        &project_dir.join("assets/maps"),
        &project_dir.join("assets/covers"),
    ];

    for dir in &dirs {
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
        }
    }

    Ok(())
}

/// Write (or overwrite) the project's `meta.json`.
///
/// meta.json lives outside of SQLite so the migration system can read the
/// schema version before opening the database.
///
/// IMPORTANT: no absolute paths are stored in meta.json.
/// All asset references inside the project use paths relative to the
/// project folder root.
fn write_meta_json(project_dir: &PathBuf, schema_version: u32) -> Result<(), InkwellError> {
    let meta_path = project_dir.join("meta.json");

    // Only write if it doesn't exist yet, to avoid overwriting an
    // existing project_id (which must never change once set).
    if meta_path.exists() {
        // Update schema version if it changed (e.g. after a migration).
        let existing = std::fs::read_to_string(&meta_path)?;
        let mut meta: serde_json::Value = serde_json::from_str(&existing)?;

        if meta["inkwell_schema"].as_u64() != Some(schema_version as u64) {
            meta["inkwell_schema"] = serde_json::json!(schema_version);
            meta["app_version"] = serde_json::json!(ProjectMeta::APP_VERSION);
            let updated = serde_json::to_string_pretty(&meta)?;
            std::fs::write(&meta_path, updated)?;
        }

        return Ok(());
    }

    // First time: generate a new project_id (ULID) and write full meta.json.
    let project_id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let meta = ProjectMeta {
        inkwell_schema: schema_version,
        project_id,
        project_name: "Default Project".into(), // overridden when user names their project
        created_at: now,
        app_version: ProjectMeta::APP_VERSION.into(),
    };

    let json = serde_json::to_string_pretty(&meta)?;
    std::fs::write(&meta_path, json)?;

    Ok(())
}

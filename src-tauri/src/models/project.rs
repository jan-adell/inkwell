use serde::{Deserialize, Serialize};

/// The contents of a project's `meta.json` file.
///
/// This file lives outside of `project.db` so that the migration system
/// can read the schema version before opening the database.
///
/// IMPORTANT: All paths inside a project are stored relative to the
/// project folder root. No absolute paths are ever stored here or in
/// the database. This is what makes projects portable across machines.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    /// Schema version of the SQLite database.
    /// Compared against the app's known schema version on open.
    pub inkwell_schema: u32,

    /// Globally unique project identifier (ULID).
    /// Never changes once a project is created.
    pub project_id: String,

    /// Human-readable project name (display only, not a path).
    pub project_name: String,

    /// ISO 8601 creation timestamp.
    pub created_at: String,

    /// The Inkwell app version that created or last migrated this project.
    pub app_version: String,
}

impl ProjectMeta {
    /// The current schema version this build of Inkwell understands.
    #[allow(dead_code)]
    pub const CURRENT_SCHEMA: u32 = 1;

    /// The app version string baked into this build.
    pub const APP_VERSION: &'static str = env!("CARGO_PKG_VERSION");
}

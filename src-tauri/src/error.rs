use thiserror::Error;

/// Top-level error type for Inkwell Core.
///
/// All errors that cross the Tauri IPC boundary must implement `serde::Serialize`
/// so they can be sent to the frontend as JSON. We implement that below.
#[derive(Debug, Error)]
pub enum InkwellError {
    /// SQLite / database errors.
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    /// File system errors (reading/writing project folder, assets, meta.json).
    #[error("Filesystem error: {0}")]
    Filesystem(#[from] std::io::Error),

    /// JSON serialization/deserialization errors.
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// A migration failed to apply.
    #[error("Migration error: {0}")]
    Migration(String),

    /// The project folder or meta.json is invalid or corrupt.
    #[error("Invalid project: {0}")]
    #[allow(dead_code)]
    InvalidProject(String),

    /// A value that was required was not found.
    #[error("Not found: {0}")]
    NotFound(String),

    /// Input failed domain validation (e.g. wrong field type, malformed value).
    #[error("Validation error: {0}")]
    Validation(String),

    /// A uniqueness constraint was violated (e.g. duplicate active field name).
    #[error("Conflict: {0}")]
    Conflict(String),

    /// The operation is not permitted (e.g. deleting a system entity type).
    #[error("Forbidden: {0}")]
    Forbidden(String),

    /// Generic internal error for cases that don't fit the above.
    #[error("Internal error: {0}")]
    Internal(String),
}

/// Allow InkwellError to cross the Tauri IPC boundary.
/// Tauri requires command errors to be serializable.
impl serde::Serialize for InkwellError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Convenience alias.
pub type Result<T> = std::result::Result<T, InkwellError>;

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use crate::error::{InkwellError, Result};

/// Blob store helpers for reading and writing heavy content files inside a
/// project's .inkwell folder. All paths are relative to the project root and
/// validated to prevent path traversal.

pub fn resolve_project_root(project_dir: &Path) -> Result<PathBuf> {
    if !project_dir.exists() {
        return Err(InkwellError::Filesystem(io::Error::new(
            io::ErrorKind::NotFound,
            format!("Project directory {:?} does not exist", project_dir),
        )));
    }
    Ok(project_dir.to_path_buf())
}

fn validate_relative_path(relative: &Path) -> Result<()> {
    if relative.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(InkwellError::Filesystem(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Relative path must not traverse parent directories",
        )));
    }
    Ok(())
}

/// Read a UTF-8 blob from the project folder at `relative_path`.
pub fn read_blob(project_dir: &Path, relative_path: &Path) -> Result<String> {
    validate_relative_path(relative_path)?;
    let root = resolve_project_root(project_dir)?;
    let full = root.join(relative_path);
    let mut s = String::new();
    let mut f = File::open(&full)?;
    f.read_to_string(&mut s)?;
    Ok(s)
}

/// Write a UTF-8 blob into the project folder at `relative_path`. This is done
/// atomically by writing to a temp file in the same directory and renaming.
pub fn write_blob(project_dir: &Path, relative_path: &Path, content: &str) -> Result<()> {
    validate_relative_path(relative_path)?;
    let root = resolve_project_root(project_dir)?;
    let full = root.join(relative_path);

    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }

    let tmp = full.with_extension("tmp");
    {
        let mut f = File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.flush()?;
    }

    fs::rename(tmp, &full)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn write_and_read_blob() {
        let dir = tempdir().unwrap();
        let project_root = dir.path();
        let rel = Path::new("content/documents/doc1.json");
        let content = r#"{"hello": "world"}"#;

        write_blob(project_root, rel, content).expect("write blob");
        let read = read_blob(project_root, rel).expect("read blob");
        assert_eq!(read, content);
    }

    #[test]
    fn prevent_path_traversal() {
        let dir = tempdir().unwrap();
        let project_root = dir.path();
        let rel = Path::new("../outside.txt");
        let res = write_blob(project_root, rel, "bad");
        assert!(res.is_err());
    }
}

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownProject {
    pub project_id: String,
    pub name: String,
    pub path: String,
    pub last_opened_at: String,
}

fn registry_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("registry.json")
}

pub fn load(app_data_dir: &Path) -> Result<Vec<KnownProject>> {
    let path = registry_path(app_data_dir);
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    if content.trim().is_empty() {
        return Ok(vec![]);
    }
    let projects: Vec<KnownProject> = serde_json::from_str(&content)?;
    Ok(projects)
}

fn save(app_data_dir: &Path, projects: &[KnownProject]) -> Result<()> {
    fs::create_dir_all(app_data_dir)?;
    let path = registry_path(app_data_dir);
    let tmp_path = app_data_dir.join("registry.json.tmp");
    let json = serde_json::to_string_pretty(projects)?;
    fs::write(&tmp_path, json)?;
    fs::rename(&tmp_path, &path)?;
    Ok(())
}

pub fn remove(app_data_dir: &Path, project_id: &str) -> Result<()> {
    let mut projects = load(app_data_dir)?;
    projects.retain(|p| p.project_id != project_id);
    save(app_data_dir, &projects)
}

pub fn register(
    app_data_dir: &Path,
    project_id: &str,
    name: &str,
    project_path: &Path,
) -> Result<()> {
    let mut projects = load(app_data_dir)?;
    let now = chrono::Utc::now().to_rfc3339();
    let path_str = project_path.to_string_lossy().into_owned();

    match projects.iter_mut().find(|p| p.project_id == project_id) {
        Some(existing) => {
            existing.name = name.to_string();
            existing.last_opened_at = now;
        }
        None => projects.push(KnownProject {
            project_id: project_id.to_string(),
            name: name.to_string(),
            path: path_str,
            last_opened_at: now,
        }),
    }

    projects.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
    save(app_data_dir, &projects)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn empty_registry_returns_empty_list() {
        let dir = tempdir().unwrap();
        assert!(load(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn register_adds_project() {
        let dir = tempdir().unwrap();
        let project_path = dir.path().join("MyNovel.inkwell");
        register(dir.path(), "proj-1", "My Novel", &project_path).unwrap();
        let projects = load(dir.path()).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].project_id, "proj-1");
        assert_eq!(projects[0].name, "My Novel");
    }

    #[test]
    fn register_upserts_existing() {
        let dir = tempdir().unwrap();
        let project_path = dir.path().join("MyNovel.inkwell");
        register(dir.path(), "proj-1", "My Novel", &project_path).unwrap();
        register(dir.path(), "proj-1", "My Novel Renamed", &project_path).unwrap();
        let projects = load(dir.path()).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "My Novel Renamed");
    }

    #[test]
    fn register_multiple_projects() {
        let dir = tempdir().unwrap();
        register(
            dir.path(),
            "proj-1",
            "Novel A",
            &dir.path().join("A.inkwell"),
        )
        .unwrap();
        register(
            dir.path(),
            "proj-2",
            "Novel B",
            &dir.path().join("B.inkwell"),
        )
        .unwrap();
        let projects = load(dir.path()).unwrap();
        assert_eq!(projects.len(), 2);
    }

    #[test]
    fn remove_project() {
        let dir = tempdir().unwrap();
        register(
            dir.path(),
            "proj-1",
            "Novel A",
            &dir.path().join("A.inkwell"),
        )
        .unwrap();
        register(
            dir.path(),
            "proj-2",
            "Novel B",
            &dir.path().join("B.inkwell"),
        )
        .unwrap();
        remove(dir.path(), "proj-1").unwrap();
        let projects = load(dir.path()).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].project_id, "proj-2");
    }

    #[test]
    fn remove_nonexistent_is_noop() {
        let dir = tempdir().unwrap();
        remove(dir.path(), "does-not-exist").unwrap();
    }

    #[test]
    fn list_is_sorted_most_recently_opened_first() {
        let dir = tempdir().unwrap();
        register(dir.path(), "proj-1", "Older", &dir.path().join("A.inkwell")).unwrap();
        register(dir.path(), "proj-2", "Newer", &dir.path().join("B.inkwell")).unwrap();
        let projects = load(dir.path()).unwrap();
        assert_eq!(projects[0].project_id, "proj-2");
    }
}

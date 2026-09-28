use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{InkwellError, Result};
use crate::models::entity_template::{
    CreateEntityTemplateRequest, DefaultField, EntityTemplate, UpdateEntityTemplateRequest,
};

fn templates_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("entity_templates.json")
}

pub fn load(app_data_dir: &Path) -> Result<Vec<EntityTemplate>> {
    let path = templates_path(app_data_dir);
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let defaults = builtin_defaults();
            save(app_data_dir, &defaults)?;
            return Ok(defaults);
        }
        Err(e) => return Err(e.into()),
    };
    if content.trim().is_empty() {
        return Ok(vec![]);
    }
    let templates: Vec<EntityTemplate> = serde_json::from_str(&content)?;
    Ok(templates)
}

fn save(app_data_dir: &Path, templates: &[EntityTemplate]) -> Result<()> {
    fs::create_dir_all(app_data_dir)?;
    let path = templates_path(app_data_dir);
    let tmp_path = app_data_dir.join("entity_templates.json.tmp");
    let json = serde_json::to_string_pretty(templates)?;
    fs::write(&tmp_path, json)?;
    fs::rename(&tmp_path, &path)?;
    Ok(())
}

pub fn create(app_data_dir: &Path, req: &CreateEntityTemplateRequest) -> Result<EntityTemplate> {
    let mut templates = load(app_data_dir)?;
    let template = EntityTemplate {
        id: ulid::Ulid::new().to_string(),
        name: req.name.clone(),
        name_plural: req.name_plural.clone(),
        color: req.color.clone(),
        fields: req.fields.clone(),
    };
    templates.push(template.clone());
    save(app_data_dir, &templates)?;
    Ok(template)
}

pub fn update(
    app_data_dir: &Path,
    id: &str,
    req: &UpdateEntityTemplateRequest,
) -> Result<EntityTemplate> {
    let mut templates = load(app_data_dir)?;
    let idx = templates
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| InkwellError::NotFound(format!("EntityTemplate '{id}' not found")))?;

    let current = templates[idx].clone();
    let updated = EntityTemplate {
        id: current.id,
        name: req.name.clone().unwrap_or(current.name),
        name_plural: req.name_plural.clone().unwrap_or(current.name_plural),
        color: req.color.clone().unwrap_or(current.color),
        fields: req.fields.clone().unwrap_or(current.fields),
    };
    templates[idx] = updated.clone();
    save(app_data_dir, &templates)?;
    Ok(updated)
}

pub fn delete(app_data_dir: &Path, id: &str) -> Result<()> {
    let mut templates = load(app_data_dir)?;
    templates.retain(|t| t.id != id);
    save(app_data_dir, &templates)
}

fn field(name: &str, label: &str, field_type: &str) -> DefaultField {
    DefaultField {
        name: name.to_string(),
        label: label.to_string(),
        field_type: field_type.to_string(),
        options: None,
        default_value: None,
    }
}

fn field_with_options(name: &str, label: &str, field_type: &str, options: &str) -> DefaultField {
    DefaultField {
        name: name.to_string(),
        label: label.to_string(),
        field_type: field_type.to_string(),
        options: Some(options.to_string()),
        default_value: None,
    }
}

fn field_with_default(
    name: &str,
    label: &str,
    field_type: &str,
    default_value: &str,
) -> DefaultField {
    DefaultField {
        name: name.to_string(),
        label: label.to_string(),
        field_type: field_type.to_string(),
        options: None,
        default_value: Some(default_value.to_string()),
    }
}

fn builtin_defaults() -> Vec<EntityTemplate> {
    vec![
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Character".to_string(),
            name_plural: "Characters".to_string(),
            color: "#8B6FE8".to_string(),
            fields: vec![
                field("birth_date", "Birth Date", "date"),
                field_with_options("height", "Height", "number", r#"{"unit":"cm"}"#),
                field_with_options(
                    "eye_color",
                    "Eye Color",
                    "select",
                    r#"["Brown","Blue","Green","Hazel","Gray","Amber","Other"]"#,
                ),
                field("occupation", "Occupation", "text"),
                field("personality", "Personality", "textarea"),
                field_with_default("alive", "Alive", "boolean", "true"),
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Location".to_string(),
            name_plural: "Locations".to_string(),
            color: "#4EA86B".to_string(),
            fields: vec![
                field("description", "Description", "textarea"),
                field_with_options(
                    "climate",
                    "Climate",
                    "select",
                    r#"["Tropical","Arid","Temperate","Continental","Polar","Mediterranean","Other"]"#,
                ),
                field("population", "Population", "number"),
                field("founded", "Founded", "date"),
                field("region", "Region", "text"),
                field("notable_landmark", "Notable Landmark", "text"),
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Item".to_string(),
            name_plural: "Items".to_string(),
            color: "#E8883A".to_string(),
            fields: vec![
                field("description", "Description", "textarea"),
                field("material", "Material", "text"),
                field("value", "Value", "number"),
                field_with_options(
                    "rarity",
                    "Rarity",
                    "select",
                    r#"["Common","Uncommon","Rare","Legendary","Unique"]"#,
                ),
                field("origin", "Origin", "textarea"),
                field("magical", "Magical", "boolean"),
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Event".to_string(),
            name_plural: "Events".to_string(),
            color: "#4A9FD4".to_string(),
            fields: vec![
                field("description", "Description", "textarea"),
                field("date", "Date", "date"),
                field("duration", "Duration", "text"),
                field("outcome", "Outcome", "textarea"),
                field_with_options(
                    "significance",
                    "Significance",
                    "select",
                    r#"["Minor","Notable","Major","Pivotal"]"#,
                ),
                field("casualties", "Casualties", "number"),
            ],
        },
        EntityTemplate {
            id: ulid::Ulid::new().to_string(),
            name: "Organization".to_string(),
            name_plural: "Organizations".to_string(),
            color: "#D44A7A".to_string(),
            fields: vec![
                field("description", "Description", "textarea"),
                field("founded", "Founded", "date"),
                field_with_options(
                    "type",
                    "Type",
                    "select",
                    r#"["Government","Guild","Religious","Military","Criminal","Commercial","Academic","Other"]"#,
                ),
                field("headquarters", "Headquarters", "text"),
                field("motto", "Motto", "text"),
                field("active", "Active", "boolean"),
            ],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn load_seeds_builtins_on_first_call() {
        let dir = tempdir().unwrap();
        let templates = load(dir.path()).unwrap();
        assert_eq!(templates.len(), 5);
        let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Character"));
        assert!(names.contains(&"Location"));
        assert!(names.contains(&"Item"));
        assert!(names.contains(&"Event"));
        assert!(names.contains(&"Organization"));
    }

    #[test]
    fn load_does_not_reseed_on_second_call() {
        let dir = tempdir().unwrap();
        let first = load(dir.path()).unwrap();
        let second = load(dir.path()).unwrap();
        assert_eq!(second.len(), 5);
        assert_eq!(first[0].id, second[0].id);
    }

    #[test]
    fn create_adds_a_template() {
        let dir = tempdir().unwrap();
        load(dir.path()).unwrap();
        let req = CreateEntityTemplateRequest {
            name: "Planet".to_string(),
            name_plural: "Planets".to_string(),
            color: "#00FFAA".to_string(),
            fields: vec![DefaultField {
                name: "radius_km".to_string(),
                label: "Radius (km)".to_string(),
                field_type: "number".to_string(),
                options: None,
                default_value: None,
            }],
        };
        let created = create(dir.path(), &req).unwrap();
        assert_eq!(created.name, "Planet");
        assert!(!created.id.is_empty());

        let templates = load(dir.path()).unwrap();
        assert_eq!(templates.len(), 6);
        assert!(templates.iter().any(|t| t.name == "Planet"));
    }

    #[test]
    fn update_modifies_an_existing_template() {
        let dir = tempdir().unwrap();
        let templates = load(dir.path()).unwrap();
        let character = templates
            .iter()
            .find(|t| t.name == "Character")
            .unwrap()
            .clone();

        let req = UpdateEntityTemplateRequest {
            name: Some("Protagonist".to_string()),
            name_plural: None,
            color: None,
            fields: None,
        };
        let updated = update(dir.path(), &character.id, &req).unwrap();
        assert_eq!(updated.name, "Protagonist");
        assert_eq!(updated.color, character.color);

        let after = load(dir.path()).unwrap();
        assert!(after.iter().any(|t| t.name == "Protagonist"));
        assert!(!after.iter().any(|t| t.name == "Character"));
    }

    #[test]
    fn update_missing_id_errors() {
        let dir = tempdir().unwrap();
        load(dir.path()).unwrap();
        let req = UpdateEntityTemplateRequest {
            name: Some("X".to_string()),
            name_plural: None,
            color: None,
            fields: None,
        };
        let result = update(dir.path(), "does-not-exist", &req);
        assert!(matches!(result, Err(InkwellError::NotFound(_))));
    }

    #[test]
    fn delete_removes_a_builtin_template() {
        let dir = tempdir().unwrap();
        let templates = load(dir.path()).unwrap();
        let character = templates
            .iter()
            .find(|t| t.name == "Character")
            .unwrap()
            .clone();
        delete(dir.path(), &character.id).unwrap();
        let after = load(dir.path()).unwrap();
        assert_eq!(after.len(), 4);
        assert!(!after.iter().any(|t| t.name == "Character"));
    }
}

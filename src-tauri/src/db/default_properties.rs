pub struct DefaultField {
    pub name: &'static str,
    pub label: &'static str,
    pub field_type: &'static str,
    pub options: Option<&'static str>,
    pub default_value: Option<&'static str>,
}

const fn field(name: &'static str, label: &'static str, field_type: &'static str) -> DefaultField {
    DefaultField {
        name,
        label,
        field_type,
        options: None,
        default_value: None,
    }
}

const fn field_with_options(
    name: &'static str,
    label: &'static str,
    field_type: &'static str,
    options: &'static str,
) -> DefaultField {
    DefaultField {
        name,
        label,
        field_type,
        options: Some(options),
        default_value: None,
    }
}

const CHARACTER_FIELDS: &[DefaultField] = &[
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
    DefaultField {
        name: "alive",
        label: "Alive",
        field_type: "boolean",
        options: None,
        default_value: Some("true"),
    },
];

const LOCATION_FIELDS: &[DefaultField] = &[
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
];

const ITEM_FIELDS: &[DefaultField] = &[
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
];

const EVENT_FIELDS: &[DefaultField] = &[
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
];

const ORGANIZATION_FIELDS: &[DefaultField] = &[
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
];

pub fn default_fields_for(entity_type_name: &str) -> &'static [DefaultField] {
    match entity_type_name {
        "Character" => CHARACTER_FIELDS,
        "Location" => LOCATION_FIELDS,
        "Item" => ITEM_FIELDS,
        "Event" => EVENT_FIELDS,
        "Organization" => ORGANIZATION_FIELDS,
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn character_has_expected_fields() {
        let fields: Vec<(&str, &str)> = default_fields_for("Character")
            .iter()
            .map(|f| (f.name, f.field_type))
            .collect();
        assert_eq!(
            fields,
            vec![
                ("birth_date", "date"),
                ("height", "number"),
                ("eye_color", "select"),
                ("occupation", "text"),
                ("personality", "textarea"),
                ("alive", "boolean"),
            ]
        );
    }

    #[test]
    fn each_named_type_has_six_fields() {
        for name in ["Character", "Location", "Item", "Event", "Organization"] {
            assert_eq!(
                default_fields_for(name).len(),
                6,
                "expected 6 default fields for {name}"
            );
        }
    }

    #[test]
    fn unrecognized_or_blank_type_names_have_no_default_fields() {
        assert!(default_fields_for("Entity").is_empty());
        assert!(default_fields_for("Some Custom Type").is_empty());
    }
}

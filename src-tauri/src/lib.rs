mod commands;
mod db;
mod error;
mod models;
mod services;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::core::initialize_core,
            // Entity types
            commands::entity_types::create_entity_type,
            commands::entity_types::get_entity_type,
            commands::entity_types::list_entity_types,
            commands::entity_types::update_entity_type,
            commands::entity_types::delete_entity_type,
            // Entities
            commands::entities::create_entity,
            commands::entities::get_entity,
            commands::entities::list_entities,
            commands::entities::list_entities_by_type,
            commands::entities::update_entity,
            commands::entities::delete_entity,
            // Field definitions
            commands::field_definitions::create_field_definition,
            commands::field_definitions::list_field_definitions,
            commands::field_definitions::update_field_definition,
            commands::field_definitions::delete_field_definition,
            // Field values
            commands::field_values::set_field_value,
            commands::field_values::get_field_values,
            commands::field_values::delete_field_value,
            // Relation types
            commands::relation_types::create_relation_type,
            commands::relation_types::get_relation_type,
            commands::relation_types::list_relation_types,
            commands::relation_types::update_relation_type,
            commands::relation_types::delete_relation_type,
            // Relations
            commands::relations::create_relation,
            commands::relations::delete_relation,
            commands::relations::list_outgoing_relations,
            commands::relations::list_incoming_relations,
            // Documents
            commands::documents::create_document,
            commands::documents::get_document,
            commands::documents::list_root_documents,
            commands::documents::list_child_documents,
            commands::documents::update_document,
            commands::documents::delete_document,
            commands::documents::write_document_blob,
            commands::documents::read_document_blob,
            // Projects
            commands::projects::list_projects,
            commands::projects::update_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Inkwell");
}

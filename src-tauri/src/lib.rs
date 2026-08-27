--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@
             commands::relations::list_incoming_relations,
             // Documents
             commands::documents::create_document,
             commands::documents::get_document,
             commands::documents::list_root_documents,
             commands::documents::list_child_documents,
             commands::documents::update_document,
             commands::documents::delete_document,
+            // Projects
+            commands::projects::list_projects,
+            commands::projects::update_project,
         ])
         .run(tauri::generate_context!())
         .expect("error while running Inkwell");

// Services module — business logic layer between commands and the database.
//
// Foundation phase: empty. No services are needed until Implementation 002+
// introduces entities, documents, and relations.
//
// Future modules will be declared here, for example:
//   pub mod entity_service;
//   pub mod document_service;
//   pub mod relation_service;
//   pub mod search_service;
//   pub mod snapshot_service;
//
// Services take a `&Connection` (or future connection pool handle) and
// return `crate::error::Result<T>`. They contain no Tauri-specific code —
// that belongs in `commands/`. This separation makes services testable
// without a running Tauri app.

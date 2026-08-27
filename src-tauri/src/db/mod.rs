--- a/src-tauri/src/db/mod.rs
+++ b/src-tauri/src/db/mod.rs
@@
 pub mod project_repo;
 pub mod relation_repo;
 pub mod relation_type_repo;
+pub mod document_blob;
@@
 pub fn verify_pragmas(conn: &Connection) -> Result<PragmaStatus> {

import { invoke } from "@tauri-apps/api/core";
import type { Document, Entity, EntityAsset, EntityFolder, EntityType, FieldDefinition, FieldValue, InitResult, KnownProject, OpenProjectResult, Relation, RelationType, ProjectStats } from "../types/core";

export async function invokeInitializeCore(): Promise<InitResult> { return invoke<InitResult>("initialize_core"); }
export async function invokeDeleteProject(projectId: string): Promise<void> { return invoke("delete_project", { projectId }); }
export async function invokeExportProject(projectId: string, destPath: string): Promise<void> { return invoke("export_project", { projectId, destPath }); }
export async function invokeImportProject(archivePath: string): Promise<OpenProjectResult> { return invoke("import_project", { archivePath }); }
export async function invokeCreateProject(name: string): Promise<OpenProjectResult> { return invoke("create_project", { name }); }
export async function invokeOpenProject(path: string): Promise<OpenProjectResult> { return invoke("open_project", { path }); }
export async function invokeListKnownProjects(): Promise<KnownProject[]> { return invoke<KnownProject[]>("list_known_projects"); }

export async function invokeListRootDocuments(projectId: string): Promise<Document[]> { return invoke<Document[]>("list_root_documents", { projectId }); }
export async function invokeListChildDocuments(parentId: string): Promise<Document[]> { return invoke<Document[]>("list_child_documents", { parentId }); }
export async function invokeCreateDocument(projectId: string, req: { node_type: string; title: string; parent_id?: string; status?: string; sort_order?: number }): Promise<Document> { return invoke<Document>("create_document", { projectId, req }); }
export async function invokeDeleteDocument(id: string): Promise<void> { return invoke<void>("delete_document", { id }); }
export async function invokeUpdateDocument(id: string, req: { title?: string; synopsis?: string; status?: string; sort_order?: number; parent_id?: string | null }): Promise<Document> { return invoke<Document>("update_document", { id, req }); }
export type ExportFormat = "txt" | "pdf" | "epub";
export async function invokeExportBook(projectId: string, format: ExportFormat, destPath: string): Promise<void> { return invoke("export_book", { projectId, format, destPath }); }

export async function invokeListEntityTypes(projectId: string): Promise<EntityType[]> { return invoke<EntityType[]>("list_entity_types", { projectId }); }
export async function invokeListEntitiesByType(projectId: string, entityTypeId: string): Promise<Entity[]> { return invoke<Entity[]>("list_entities_by_type", { projectId, entityTypeId }); }
export async function invokeCreateEntity(projectId: string, req: { entity_type_id: string; name: string; folder_id?: string | null }): Promise<Entity> { return invoke<Entity>("create_entity", { projectId, req }); }
export async function invokeUpdateEntity(id: string, req: { name?: string; summary?: string; sort_order?: number; folder_id?: string | null }): Promise<Entity> { return invoke<Entity>("update_entity", { id, req }); }
export async function invokeDeleteEntity(id: string): Promise<void> { return invoke("delete_entity", { id }); }
export async function invokeListRootEntities(projectId: string): Promise<Entity[]> { return invoke<Entity[]>("list_root_entities", { projectId }); }
export async function invokeListEntitiesByFolder(projectId: string, folderId: string): Promise<Entity[]> { return invoke<Entity[]>("list_entities_by_folder", { projectId, folderId }); }

export async function invokeListEntityFolders(projectId: string): Promise<EntityFolder[]> { return invoke<EntityFolder[]>("list_entity_folders", { projectId }); }
export async function invokeCreateEntityFolder(projectId: string, req: { name: string }): Promise<EntityFolder> { return invoke<EntityFolder>("create_entity_folder", { projectId, req }); }
export async function invokeUpdateEntityFolder(id: string, req: { name?: string; sort_order?: number }): Promise<EntityFolder> { return invoke<EntityFolder>("update_entity_folder", { id, req }); }
export async function invokeDeleteEntityFolder(id: string): Promise<void> { return invoke("delete_entity_folder", { id }); }

export async function invokeListFieldDefinitions(entityTypeId: string): Promise<FieldDefinition[]> { return invoke<FieldDefinition[]>("list_field_definitions", { entityTypeId }); }
export async function invokeCreateFieldDefinition(req: { entity_type_id: string; name: string; label: string; field_type: string; options?: string; sort_order?: number }): Promise<FieldDefinition> { return invoke<FieldDefinition>("create_field_definition", { req }); }
export async function invokeDeleteFieldDefinition(id: string): Promise<void> { return invoke("delete_field_definition", { id }); }

export async function invokeSetFieldValue(req: { entity_id: string; field_def_id: string; value: { type: string; value: unknown } }): Promise<FieldValue> { return invoke<FieldValue>("set_field_value", { req }); }
export async function invokeGetFieldValues(entityId: string): Promise<FieldValue[]> { return invoke<FieldValue[]>("get_field_values", { entityId }); }
export async function invokeWriteDocumentContent(documentId: string, contentJson: string, contentText: string): Promise<Document> { return invoke<Document>("write_document_content", { documentId, contentJson, contentText }); }
export async function invokeReadDocumentContent(documentId: string): Promise<string> { return invoke<string>("read_document_content", { documentId }); }
export async function invokeWriteEntityNotes(entityId: string, notesJson: string, notesText: string): Promise<void> { return invoke("write_entity_notes", { entityId, notesJson, notesText }); }
export async function invokeReadEntityNotes(entityId: string): Promise<string | null> { return invoke<string | null>("read_entity_notes", { entityId }); }
export async function invokeAddEntityAsset(entityId: string, sourcePath: string, label?: string): Promise<EntityAsset> { return invoke<EntityAsset>("add_entity_asset", { entityId, sourcePath, label: label ?? null }); }
export async function invokeReadEntityAsset(assetId: string): Promise<string> { return invoke<string>("read_entity_asset", { assetId }); }
export async function invokeListEntityAssets(entityId: string): Promise<EntityAsset[]> { return invoke<EntityAsset[]>("list_entity_assets", { entityId }); }
export async function invokeDeleteEntityAsset(assetId: string): Promise<void> { return invoke("delete_entity_asset", { assetId }); }

export async function invokeCreateRelationType(projectId: string, req: { name: string; label: string; inverse_name?: string; inverse_label?: string; allowed_source_types?: string; allowed_target_types?: string; color?: string }): Promise<RelationType> { return invoke<RelationType>("create_relation_type", { projectId, req }); }
export async function invokeListRelationTypes(projectId: string): Promise<RelationType[]> { return invoke<RelationType[]>("list_relation_types", { projectId }); }
export async function invokeCreateRelation(projectId: string, req: { source_entity_id: string; relation_type_id: string; target_entity_id: string; notes?: string; sort_order?: number }): Promise<Relation> { return invoke<Relation>("create_relation", { projectId, req }); }
export async function invokeDeleteRelation(id: string): Promise<void> { return invoke("delete_relation", { id }); }
export async function invokeListOutgoingRelations(entityId: string): Promise<Relation[]> { return invoke<Relation[]>("list_outgoing_relations", { entityId }); }
export async function invokeListIncomingRelations(entityId: string): Promise<Relation[]> { return invoke<Relation[]>("list_incoming_relations", { entityId }); }
export async function invokeGetProjectStats(projectId: string): Promise<ProjectStats> { return invoke<ProjectStats>("get_project_stats", { projectId }); }

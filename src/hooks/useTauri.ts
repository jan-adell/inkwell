import { invoke } from "@tauri-apps/api/core";
import type { Document, Entity, EntityAsset, EntityType, InitResult, KnownProject, OpenProjectResult } from "../types/core";

export async function invokeInitializeCore(): Promise<InitResult> {
  return invoke<InitResult>("initialize_core");
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function invokeDeleteProject(projectId: string): Promise<void> {
  return invoke("delete_project", { projectId });
}

export async function invokeExportProject(
  projectId: string,
  destPath: string,
): Promise<void> {
  return invoke("export_project", { projectId, destPath });
}

export async function invokeImportProject(archivePath: string): Promise<OpenProjectResult> {
  return invoke("import_project", { archivePath });
}

export async function invokeCreateProject(name: string): Promise<OpenProjectResult> {
  return invoke("create_project", { name });
}

export async function invokeOpenProject(path: string): Promise<OpenProjectResult> {
  return invoke("open_project", { path });
}

export async function invokeListKnownProjects(): Promise<KnownProject[]> {
  return invoke<KnownProject[]>("list_known_projects");
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function invokeListRootDocuments(projectId: string): Promise<Document[]> {
  return invoke<Document[]>("list_root_documents", { projectId });
}

export async function invokeListChildDocuments(parentId: string): Promise<Document[]> {
  return invoke<Document[]>("list_child_documents", { parentId });
}

export async function invokeCreateDocument(
  projectId: string,
  req: {
    node_type: string;
    title: string;
    parent_id?: string;
    status?: string;
  }
): Promise<Document> {
  return invoke<Document>("create_document", { projectId, req });
}

export async function invokeDeleteDocument(id: string): Promise<void> {
  return invoke<void>("delete_document", { id });
}

// ── Entity types ──────────────────────────────────────────────────────────────

export async function invokeListEntityTypes(projectId: string): Promise<EntityType[]> {
  return invoke<EntityType[]>("list_entity_types", { projectId });
}

export async function invokeListEntitiesByType(
  projectId: string,
  entityTypeId: string
): Promise<Entity[]> {
  return invoke<Entity[]>("list_entities_by_type", { projectId, entityTypeId });
}

export async function invokeCreateEntity(
  projectId: string,
  req: { entity_type_id: string; name: string }
): Promise<Entity> {
  return invoke<Entity>("create_entity", { projectId, req });
}

// ── Document content ──────────────────────────────────────────────────────────

export async function invokeWriteDocumentContent(
  documentId: string,
  contentJson: string,
  contentText: string,
): Promise<void> {
  return invoke("write_document_content", { documentId, contentJson, contentText });
}

export async function invokeReadDocumentContent(documentId: string): Promise<string> {
  return invoke<string>("read_document_content", { documentId });
}

// ── Entity notes ──────────────────────────────────────────────────────────────

export async function invokeWriteEntityNotes(
  entityId: string,
  notesJson: string,
  notesText: string,
): Promise<void> {
  return invoke("write_entity_notes", { entityId, notesJson, notesText });
}

export async function invokeReadEntityNotes(entityId: string): Promise<string | null> {
  return invoke<string | null>("read_entity_notes", { entityId });
}

// ── Entity assets ─────────────────────────────────────────────────────────────

export async function invokeAddEntityAsset(
  entityId: string,
  sourcePath: string,
  label?: string,
): Promise<EntityAsset> {
  return invoke<EntityAsset>("add_entity_asset", { entityId, sourcePath, label: label ?? null });
}

export async function invokeListEntityAssets(entityId: string): Promise<EntityAsset[]> {
  return invoke<EntityAsset[]>("list_entity_assets", { entityId });
}

export async function invokeDeleteEntityAsset(assetId: string): Promise<void> {
  return invoke("delete_entity_asset", { assetId });
}

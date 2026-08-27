import { invoke } from "@tauri-apps/api/core";
import type { Document, Entity, EntityType, InitResult } from "../types/core";

export async function invokeInitializeCore(): Promise<InitResult> {
  return invoke<InitResult>("initialize_core");
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


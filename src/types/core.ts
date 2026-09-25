/**
 * core.ts — TypeScript types that mirror the Rust models.
 */

export interface ProjectMeta {
  inkwell_schema: number;
  project_id: string;
  project_name: string;
  created_at: string;
  app_version: string;
}

export interface InitResult {
  ok: boolean;
  message: string;
}

export type CommandResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Domain types (mirror Rust models) ────────────────────────────────────────

export interface Document {
  id: string;
  project_id: string;
  parent_id: string | null;
  node_type: "scene" | "note" | "document" | "folder";
  title: string;
  synopsis: string | null;
  status: "idea" | "draft" | "revision" | "final";
  word_count: number;
  sort_order: number;
  is_included: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EntityType {
  id: string;
  project_id: string;
  name: string;
  name_plural: string | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Entity {
  id: string;
  project_id: string;
  entity_type_id: string;
  name: string;
  summary: string | null;
  cover_image: string | null;
  visibility: "private" | "beta" | "public";
  sort_order: number;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EntityFolder {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}

export type FieldType =
  | "text" | "textarea" | "number" | "boolean" | "date"
  | "select" | "multiselect" | "entity_ref" | "url" | "color" | "image";

export interface FieldDefinition {
  id: string;
  entity_type_id: string;
  name: string;
  label: string;
  field_type: FieldType;
  options: string | null;
  default_value: string | null;
  is_required: boolean;
  visibility: string;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}

export interface FieldValue {
  id: string;
  entity_id: string;
  field_def_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_json: string | null;
  updated_at: string;
}

export type NodeType = Document["node_type"];

export interface KnownProject {
  project_id: string;
  name: string;
  path: string;
  last_opened_at: string;
}

export interface OpenProjectResult {
  project_id: string;
  project_name: string;
  schema_version: number;
  project_path: string;
}

export interface EntityAsset {
  id: string;
  entity_id: string;
  relative_path: string;
  label: string | null;
  sort_order: number;
  created_at: string;
}

export interface RelationType {
  id: string;
  project_id: string;
  name: string;
  label: string;
  inverse_name: string | null;
  inverse_label: string | null;
  allowed_source_types: string | null;
  allowed_target_types: string | null;
  color: string | null;
  is_system: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface Relation {
  id: string;
  project_id: string;
  source_entity_id: string;
  relation_type_id: string;
  target_entity_id: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}

export interface DocumentWordCount {
  id: string;
  title: string;
  word_count: number;
}

export interface ProjectStats {
  entity_count: number;
  document_count: number;
  total_word_count: number;
  documents: DocumentWordCount[];
}


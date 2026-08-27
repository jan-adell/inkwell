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

export interface PragmaStatus {
  wal_enabled: boolean;
  foreign_keys_enabled: boolean;
}

export interface InitResult {
  ok: boolean;
  schema_version: number;
  message: string;
  pragma_status: PragmaStatus | null;
}

export type CommandResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Domain types (mirror Rust models) ────────────────────────────────────────

export interface Document {
  id: string;
  project_id: string;
  parent_id: string | null;
  node_type: "novel" | "part" | "chapter" | "scene" | "note" | "document" | "folder";
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type NodeType = Document["node_type"];


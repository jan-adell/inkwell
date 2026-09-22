import { describe, expect, it } from "vitest";
import { findEntityContext, getMergedRootItems } from "./Sidebar";
import type { Entity, EntityFolder } from "../types/core";

const entity = (id: string, name: string, sort_order = 0, folder_id: string | null = null): Entity => ({
  id,
  project_id: "proj-1",
  entity_type_id: "type-1",
  name,
  summary: null,
  cover_image: null,
  visibility: "private",
  sort_order,
  folder_id,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
});

const folder = (id: string, sort_order = 0): EntityFolder => ({
  id,
  project_id: "proj-1",
  name: `Folder ${id}`,
  sort_order,
  created_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
});

const stateWith = (
  rootEntities: Entity[],
  entitiesByFolder: Record<string, Entity[]>,
  entityFolders: EntityFolder[] = [],
) => ({
  rootEntities,
  entitiesByFolder,
  entityFolders,
} as any);

describe("findEntityContext", () => {
  it("finds entity in rootEntities", () => {
    const e1 = entity("e1", "Aragorn");
    const state = stateWith([e1], {});
    const result = findEntityContext("e1", state);
    expect(result.folderId).toBeNull();
    expect(result.list).toEqual([e1]);
  });

  it("finds entity inside a folder", () => {
    const e1 = entity("e1", "Legolas", 0, "f1");
    const state = stateWith([], { "f1": [e1] });
    const result = findEntityContext("e1", state);
    expect(result.folderId).toBe("f1");
    expect(result.list).toEqual([e1]);
  });

  it("returns empty list when entity is not found", () => {
    const state = stateWith([], {});
    const result = findEntityContext("unknown", state);
    expect(result.folderId).toBeNull();
    expect(result.list).toEqual([]);
  });

  it("prefers root list over folder when entity appears in both (root wins first)", () => {
    const e1 = entity("e1", "Gimli");
    const state = stateWith([e1], { "f1": [e1] });
    const result = findEntityContext("e1", state);
    expect(result.folderId).toBeNull();
  });
});

describe("getMergedRootItems", () => {
  it("returns empty array when store has no folders or root entities", () => {
    const state = stateWith([], {});
    expect(getMergedRootItems(state)).toEqual([]);
  });

  it("returns folders and root entities sorted by sort_order ascending", () => {
    const f1 = folder("f1", 2);
    const e1 = entity("e1", "Aragorn", 0);
    const state = stateWith([e1], {}, [f1]);
    const merged = getMergedRootItems(state);
    expect(merged[0]).toMatchObject({ kind: "entity", id: "e1" });
    expect(merged[1]).toMatchObject({ kind: "folder", id: "f1" });
  });

  it("breaks sort_order ties by placing folders before entities", () => {
    const f1 = folder("f1", 0);
    const e1 = entity("e1", "Aragorn", 0);
    const state = stateWith([e1], {}, [f1]);
    const merged = getMergedRootItems(state);
    expect(merged[0]).toMatchObject({ kind: "folder", id: "f1" });
    expect(merged[1]).toMatchObject({ kind: "entity", id: "e1" });
  });

  it("correctly interleaves multiple folders and entities", () => {
    const f1 = folder("f1", 0);
    const f2 = folder("f2", 2);
    const e1 = entity("e1", "Aragorn", 1);
    const e2 = entity("e2", "Gandalf", 3);
    const state = stateWith([e1, e2], {}, [f1, f2]);
    const merged = getMergedRootItems(state);
    expect(merged.map(item => item.id)).toEqual(["f1", "e1", "f2", "e2"]);
  });

  it("does not include entities that are inside folders", () => {
    const e1 = entity("e1", "Frodo", 0, "f1");
    const state = stateWith([], { "f1": [e1] }, [folder("f1", 0)]);
    const merged = getMergedRootItems(state);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ kind: "folder", id: "f1" });
  });
});

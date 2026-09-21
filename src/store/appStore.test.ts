import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./appStore";
import type { Entity, EntityFolder } from "../types/core";

const entity = (id: string, name: string, folder_id: string | null = null): Entity => ({
  id, project_id: "proj-1", entity_type_id: "type-1", name,
  summary: null, cover_image: null, visibility: "private",
  sort_order: 0, folder_id, created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z", deleted_at: null,
});

const folder = (id: string): EntityFolder => ({
  id, project_id: "proj-1", name: `Folder ${id}`,
  sort_order: 0, created_at: "2026-01-01T00:00:00Z", deleted_at: null,
});

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
});

describe("appStore initialisation", () => {
  it("starts uninitialised with no error", () => {
    const { coreInitialized, initError } = useAppStore.getState();
    expect(coreInitialized).toBe(false);
    expect(initError).toBeNull();
  });

  it("setCoreInitialized flips the flag", () => {
    useAppStore.getState().setCoreInitialized(true);
    expect(useAppStore.getState().coreInitialized).toBe(true);
  });

  it("setInitError stores the message", () => {
    useAppStore.getState().setInitError("something went wrong");
    expect(useAppStore.getState().initError).toBe("something went wrong");
  });
});

describe("appStore document tree", () => {
  const doc = {
    id: "doc-1",
    project_id: "proj-1",
    parent_id: null,
    node_type: "document" as const,
    title: "Chapter One",
    synopsis: null,
    status: "draft" as const,
    word_count: 0,
    sort_order: 0,
    is_included: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };

  it("addDocument appends to root when parent_id is null", () => {
    useAppStore.getState().addDocument(doc);
    expect(useAppStore.getState().rootDocuments).toHaveLength(1);
    expect(useAppStore.getState().rootDocuments[0].id).toBe("doc-1");
  });

  it("removeDocument clears selection if the removed doc was selected", () => {
    useAppStore.getState().addDocument(doc);
    useAppStore.getState().setSelectedDocumentId("doc-1");
    useAppStore.getState().removeDocument("doc-1");
    expect(useAppStore.getState().selectedDocumentId).toBeNull();
    expect(useAppStore.getState().rootDocuments).toHaveLength(0);
  });
});

describe("appStore entity slice", () => {
  it("setRootEntities replaces the root entity list", () => {
    const store = useAppStore.getState();
    store.setRootEntities([entity("e1", "Aragorn"), entity("e2", "Legolas")]);
    expect(useAppStore.getState().rootEntities).toHaveLength(2);
    store.setRootEntities([entity("e3", "Gimli")]);
    expect(useAppStore.getState().rootEntities).toHaveLength(1);
    expect(useAppStore.getState().rootEntities[0].id).toBe("e3");
  });

  it("setEntitiesForFolder stores entities under the correct folder key", () => {
    const store = useAppStore.getState();
    store.setEntitiesForFolder("f1", [entity("e1", "Frodo", "f1")]);
    store.setEntitiesForFolder("f2", [entity("e2", "Sam", "f2")]);
    expect(useAppStore.getState().entitiesByFolder["f1"]).toHaveLength(1);
    expect(useAppStore.getState().entitiesByFolder["f2"]).toHaveLength(1);
  });

  it("setEntitiesForFolder replaces only the targeted folder", () => {
    const store = useAppStore.getState();
    store.setEntitiesForFolder("f1", [entity("e1", "Frodo", "f1"), entity("e2", "Sam", "f1")]);
    store.setEntitiesForFolder("f1", [entity("e3", "Pippin", "f1")]);
    expect(useAppStore.getState().entitiesByFolder["f1"]).toHaveLength(1);
    expect(useAppStore.getState().entitiesByFolder["f1"][0].id).toBe("e3");
  });

  it("setEntityFolders replaces the folder list", () => {
    const store = useAppStore.getState();
    store.setEntityFolders([folder("f1"), folder("f2")]);
    expect(useAppStore.getState().entityFolders).toHaveLength(2);
    store.setEntityFolders([folder("f3")]);
    expect(useAppStore.getState().entityFolders).toHaveLength(1);
  });

  it("setSelectedEntityId updates the selected entity", () => {
    useAppStore.getState().setSelectedEntityId("e1");
    expect(useAppStore.getState().selectedEntityId).toBe("e1");
    useAppStore.getState().setSelectedEntityId(null);
    expect(useAppStore.getState().selectedEntityId).toBeNull();
  });

  it("resetProjectState clears entity data", () => {
    const store = useAppStore.getState();
    store.setRootEntities([entity("e1", "Aragorn")]);
    store.setEntityFolders([folder("f1")]);
    store.setEntitiesForFolder("f1", [entity("e2", "Legolas", "f1")]);
    store.setSelectedEntityId("e1");
    store.resetProjectState();
    const s = useAppStore.getState();
    expect(s.rootEntities).toHaveLength(0);
    expect(s.entityFolders).toHaveLength(0);
    expect(s.entitiesByFolder).toEqual({});
    expect(s.selectedEntityId).toBeNull();
  });
});

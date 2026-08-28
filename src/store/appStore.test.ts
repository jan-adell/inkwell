import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./appStore";

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
    node_type: "chapter" as const,
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

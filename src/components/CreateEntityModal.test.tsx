import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CreateEntityModal } from "./CreateEntityModal";
import { useAppStore } from "../store/appStore";
import type { EntityTemplate } from "../types/core";

vi.mock("../hooks/useTauri", () => ({
  invokeCreateEntity: vi.fn(),
  invokeCreateEntityFolder: vi.fn(),
  invokeListEntityTypes: vi.fn(),
}));

import { invokeCreateEntity, invokeCreateEntityFolder, invokeListEntityTypes } from "../hooks/useTauri";

const mockCreateEntity = invokeCreateEntity as ReturnType<typeof vi.fn>;
const mockCreateEntityFolder = invokeCreateEntityFolder as ReturnType<typeof vi.fn>;
const mockListEntityTypes = invokeListEntityTypes as ReturnType<typeof vi.fn>;

function makeTemplate(overrides: Partial<EntityTemplate> = {}): EntityTemplate {
  return {
    id: "tmpl1",
    name: "Character",
    name_plural: "Characters",
    color: "#8B6FE8",
    fields: [],
    ...overrides,
  };
}

function resetStore() {
  useAppStore.setState({
    projectId: "p1",
    showCreateEntityModal: true,
    entityTemplates: [makeTemplate()],
    rootEntities: [],
    entityFolders: [],
    entityTypes: [],
  });
}

describe("CreateEntityModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEntityTypes.mockResolvedValue([]);
    resetStore();
  });

  it("renders a button per app-level template, not per project entity type", () => {
    render(<CreateEntityModal />);
    expect(screen.getByRole("button", { name: /character/i })).toBeInTheDocument();
  });

  it("creates an entity by template name when a template button is clicked", async () => {
    const user = userEvent.setup();
    mockCreateEntity.mockResolvedValue({
      id: "e1", project_id: "p1", entity_type_id: "et1", name: "New Entity",
      summary: null, cover_image: null, visibility: "private", sort_order: 0,
      folder_id: null, created_at: "2026-01-01", updated_at: "2026-01-01", deleted_at: null,
    });
    render(<CreateEntityModal />);

    await user.click(screen.getByRole("button", { name: /character/i }));

    expect(mockCreateEntity).toHaveBeenCalledWith("p1", {
      entity_type_name: "Character",
      name: "New Entity",
    });
    expect(useAppStore.getState().rootEntities).toHaveLength(1);
    expect(useAppStore.getState().showCreateEntityModal).toBe(false);
  });

  it("refetches the project's entity types after creating an entity", async () => {
    const user = userEvent.setup();
    mockCreateEntity.mockResolvedValue({
      id: "e1", project_id: "p1", entity_type_id: "et1", name: "New Entity",
      summary: null, cover_image: null, visibility: "private", sort_order: 0,
      folder_id: null, created_at: "2026-01-01", updated_at: "2026-01-01", deleted_at: null,
    });
    const refetched = [{
      id: "et1", project_id: "p1", name: "Character", name_plural: "Characters",
      icon: null, color: "#8B6FE8", description: null, is_system: false, sort_order: 0,
      created_at: "2026-01-01", updated_at: "2026-01-01", deleted_at: null,
    }];
    mockListEntityTypes.mockResolvedValue(refetched);
    render(<CreateEntityModal />);

    await user.click(screen.getByRole("button", { name: /character/i }));

    await waitFor(() => {
      expect(mockListEntityTypes).toHaveBeenCalledWith("p1");
    });
    await waitFor(() => {
      expect(useAppStore.getState().entityTypes).toEqual(refetched);
    });
  });

  it("still creates a folder via the Folder button", async () => {
    const user = userEvent.setup();
    mockCreateEntityFolder.mockResolvedValue({
      id: "f1", project_id: "p1", name: "New Folder", sort_order: 0,
      created_at: "2026-01-01", deleted_at: null,
    });
    render(<CreateEntityModal />);

    await user.click(screen.getByRole("button", { name: /folder/i }));

    expect(mockCreateEntityFolder).toHaveBeenCalledWith("p1", { name: "New Folder" });
    expect(useAppStore.getState().entityFolders).toHaveLength(1);
  });
});

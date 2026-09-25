import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EntityPanel } from "./EntityPanel";
import { useAppStore } from "../store/appStore";
import type { Entity, EntityAsset, EntityType, FieldDefinition } from "../types/core";

vi.mock("../hooks/useTauri", () => ({
  invokeGetFieldValues: vi.fn(),
  invokeListFieldDefinitions: vi.fn(),
  invokeListEntityAssets: vi.fn(),
  invokeReadEntityAsset: vi.fn(),
}));

import {
  invokeGetFieldValues,
  invokeListFieldDefinitions,
  invokeListEntityAssets,
  invokeReadEntityAsset,
} from "../hooks/useTauri";

const mockGetFieldValues = invokeGetFieldValues as ReturnType<typeof vi.fn>;
const mockListFieldDefinitions = invokeListFieldDefinitions as ReturnType<typeof vi.fn>;
const mockListEntityAssets = invokeListEntityAssets as ReturnType<typeof vi.fn>;
const mockReadEntityAsset = invokeReadEntityAsset as ReturnType<typeof vi.fn>;

const ENTITY_TYPE: EntityType = {
  id: "et1",
  project_id: "p1",
  name: "Character",
  name_plural: "Characters",
  icon: null,
  color: "#c9a84c",
  description: null,
  is_system: false,
  sort_order: 0,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deleted_at: null,
};

const ENTITY: Entity = {
  id: "e1",
  project_id: "p1",
  entity_type_id: "et1",
  name: "Aragorn",
  summary: null,
  cover_image: null,
  visibility: "private",
  sort_order: 0,
  folder_id: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deleted_at: null,
};

const IMAGE_FIELD_DEF: FieldDefinition = {
  id: "fd-portrait",
  entity_type_id: "et1",
  name: "portrait",
  label: "Portrait",
  field_type: "image",
  options: null,
  default_value: null,
  is_required: false,
  visibility: "private",
  sort_order: 0,
  created_at: "2026-01-01",
  deleted_at: null,
};

function makeAsset(overrides: Partial<EntityAsset> = {}): EntityAsset {
  return {
    id: "asset1",
    entity_id: "e1",
    relative_path: "assets/entities/e1/ULID.jpg",
    label: "fd-portrait",
    sort_order: 0,
    created_at: "2026-01-01",
    ...overrides,
  };
}

function resetStore() {
  useAppStore.setState({
    selectedEntityId: null,
    entityTypes: [],
    fieldDefinitionsByType: {},
    rootEntities: [],
    entitiesByFolder: {},
  });
}

describe("EntityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    mockGetFieldValues.mockResolvedValue([]);
    mockListFieldDefinitions.mockResolvedValue([]);
    mockListEntityAssets.mockResolvedValue([]);
  });

  it("renders an image thumbnail when the image field has an asset", async () => {
    mockListEntityAssets.mockResolvedValue([makeAsset()]);
    mockReadEntityAsset.mockResolvedValue("data:image/jpeg;base64,AAAA");

    useAppStore.setState({
      entityTypes: [ENTITY_TYPE],
      rootEntities: [ENTITY],
      fieldDefinitionsByType: { et1: [IMAGE_FIELD_DEF] },
      selectedEntityId: "e1",
    });

    render(<EntityPanel />);

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "Portrait" });
      expect(img).toHaveAttribute("src", "data:image/jpeg;base64,AAAA");
    });
  });

  it("does not render an image row when the image field has no asset", async () => {
    mockListEntityAssets.mockResolvedValue([]);

    useAppStore.setState({
      entityTypes: [ENTITY_TYPE],
      rootEntities: [ENTITY],
      fieldDefinitionsByType: { et1: [IMAGE_FIELD_DEF] },
      selectedEntityId: "e1",
    });

    render(<EntityPanel />);

    await waitFor(() => {
      expect(mockListEntityAssets).toHaveBeenCalledWith("e1");
    });
    expect(screen.queryByRole("img", { name: "Portrait" })).not.toBeInTheDocument();
  });

  it("shows the entity name when selected", async () => {
    useAppStore.setState({
      entityTypes: [ENTITY_TYPE],
      rootEntities: [ENTITY],
      fieldDefinitionsByType: { et1: [] },
      selectedEntityId: "e1",
    });

    render(<EntityPanel />);

    await waitFor(() => {
      expect(screen.getByText("Aragorn")).toBeInTheDocument();
    });
  });
});

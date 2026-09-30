import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RelationshipGraph } from "./RelationshipGraph";
import { useAppStore } from "../../store/appStore";
import type { Entity, EntityType, Relation, RelationType } from "../../types/core";

vi.mock("../../hooks/useTauri", () => ({
  invokeListRelations: vi.fn(),
  invokeListRelationTypes: vi.fn(),
}));

import { invokeListRelations, invokeListRelationTypes } from "../../hooks/useTauri";

const mockListRelations = invokeListRelations as ReturnType<typeof vi.fn>;
const mockListRelationTypes = invokeListRelationTypes as ReturnType<typeof vi.fn>;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const entity = (id: string, name: string): Entity => ({
  id,
  project_id: "p1",
  entity_type_id: "et1",
  name,
  summary: null,
  cover_image: null,
  visibility: "private",
  sort_order: 0,
  folder_id: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deleted_at: null,
});

const ENTITY_TYPE = { id: "et1", color: "#ff0000" } as EntityType;
const LIVES_IN = { id: "rt1", label: "Lives in", color: null } as RelationType;
const RELATION = {
  id: "r1",
  project_id: "p1",
  source_entity_id: "e1",
  relation_type_id: "rt1",
  target_entity_id: "e2",
} as Relation;

describe("RelationshipGraph", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.clearAllMocks();
    mockListRelations.mockResolvedValue([]);
    mockListRelationTypes.mockResolvedValue([LIVES_IN]);
    useAppStore.setState({
      projectId: "p1",
      selectedEntityId: null,
      entityTypes: [ENTITY_TYPE],
      rootEntities: [entity("e1", "Kael"), entity("e2", "Valthera")],
      entitiesByFolder: {},
      relationTypes: [],
    });
  });

  it("loads the relations of the open project", async () => {
    render(<RelationshipGraph />);

    await waitFor(() => expect(mockListRelations).toHaveBeenCalledWith("p1"));
  });

  it("shows an empty state when the project has no relations", async () => {
    render(<RelationshipGraph />);

    expect(await screen.findByText(/no relations yet/i)).toBeInTheDocument();
  });

  it("draws every entity as a node once relations exist", async () => {
    mockListRelations.mockResolvedValue([RELATION]);

    render(<RelationshipGraph />);

    expect(await screen.findByText("Kael")).toBeInTheDocument();
    expect(await screen.findByText("Valthera")).toBeInTheDocument();
  });

  it("selects the entity when its node is clicked", async () => {
    mockListRelations.mockResolvedValue([RELATION]);

    render(<RelationshipGraph />);
    fireEvent.click(await screen.findByText("Kael"));

    expect(useAppStore.getState().selectedEntityId).toBe("e1");
  });
});

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

  it("does not draw entities before their relations have loaded", async () => {
    let resolveRelations: (relations: Relation[]) => void = () => {};
    mockListRelations.mockReturnValue(new Promise<Relation[]>((resolve) => { resolveRelations = resolve; }));

    render(<RelationshipGraph />);

    expect(screen.queryByText("Kael")).not.toBeInTheDocument();
    resolveRelations([RELATION]);
    expect(await screen.findByText("Kael")).toBeInTheDocument();
  });

  it("tells the author when the relations could not be loaded", async () => {
    mockListRelations.mockRejectedValue(new Error("db locked"));

    render(<RelationshipGraph />);

    expect(await screen.findByText(/could not load relations/i)).toBeInTheDocument();
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

  describe("focus on selection", () => {
    const nodeOf = async (name: string) =>
      (await screen.findByText(name)).closest(".react-flow__node") as HTMLElement;

    beforeEach(() => {
      mockListRelations.mockResolvedValue([RELATION]);
      useAppStore.setState({
        rootEntities: [entity("e1", "Kael"), entity("e2", "Valthera"), entity("e3", "Hermit")],
      });
    });

    it("dims nothing while no entity is selected", async () => {
      render(<RelationshipGraph />);

      expect((await nodeOf("Hermit")).style.opacity).toBe("1");
    });

    it("dims entities unrelated to the selected one and keeps its neighbours visible", async () => {
      useAppStore.setState({ selectedEntityId: "e1" });

      render(<RelationshipGraph />);

      expect((await nodeOf("Hermit")).style.opacity).toBe("0.2");
      expect((await nodeOf("Valthera")).style.opacity).toBe("1");
      expect((await nodeOf("Kael")).style.opacity).toBe("1");
    });

    it("dims nothing when the selected entity has no relations", async () => {
      useAppStore.setState({ selectedEntityId: "e3" });

      render(<RelationshipGraph />);

      expect((await nodeOf("Kael")).style.opacity).toBe("1");
    });
  });

  it("clears the selection when the empty canvas is clicked", async () => {
    mockListRelations.mockResolvedValue([RELATION]);
    useAppStore.setState({ selectedEntityId: "e1" });

    const { container } = render(<RelationshipGraph />);
    await screen.findByText("Kael");
    fireEvent.click(container.querySelector(".react-flow__pane") as HTMLElement);

    expect(useAppStore.getState().selectedEntityId).toBeNull();
  });

  it("selects the entity when its node is clicked", async () => {
    mockListRelations.mockResolvedValue([RELATION]);

    render(<RelationshipGraph />);
    fireEvent.click(await screen.findByText("Kael"));

    expect(useAppStore.getState().selectedEntityId).toBe("e1");
  });
});

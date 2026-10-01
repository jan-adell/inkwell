import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RelationshipGraph } from "./RelationshipGraph";
import { useAppStore } from "../../store/appStore";
import type { Entity, Relation } from "../../types/core";

const flowProps: Record<string, unknown>[] = [];

vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    flowProps.push(props);
    return <div data-testid="flow" />;
  },
  Background: () => null,
  Controls: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

vi.mock("../../hooks/useTauri", () => ({
  invokeListRelations: vi.fn().mockResolvedValue([
    { id: "r1", source_entity_id: "e1", relation_type_id: "rt1", target_entity_id: "e2" } as Relation,
  ]),
  invokeListRelationTypes: vi.fn().mockResolvedValue([]),
}));

const entity = (id: string, name: string) => ({ id, name, entity_type_id: "et1" }) as Entity;

describe("RelationshipGraph zoom", () => {
  beforeEach(() => {
    flowProps.length = 0;
    useAppStore.setState({
      projectId: "p1",
      selectedEntityId: null,
      entityTypes: [],
      rootEntities: [entity("e1", "Kael"), entity("e2", "Valthera")],
      entitiesByFolder: {},
      relationTypes: [],
    });
  });

  const lastProps = async () => {
    await screen.findByTestId("flow");
    return flowProps[flowProps.length - 1];
  };

  it("lets the author zoom out far enough to see a large graph", async () => {
    render(<RelationshipGraph />);

    expect(Number((await lastProps()).minZoom)).toBeLessThanOrEqual(0.1);
  });

  it("fits the whole graph into view on open", async () => {
    render(<RelationshipGraph />);

    expect((await lastProps()).fitView).toBe(true);
  });

  it("hides the React Flow attribution badge", async () => {
    render(<RelationshipGraph />);

    const options = (await lastProps()).proOptions as { hideAttribution: boolean };
    expect(options.hideAttribution).toBe(true);
  });

  it("pads the fitted view so border nodes are not cut off", async () => {
    render(<RelationshipGraph />);

    const options = (await lastProps()).fitViewOptions as { padding: number };
    expect(options.padding).toBeGreaterThan(0);
  });
});

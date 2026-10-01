import { describe, it, expect } from "vitest";
import { focusGraph } from "./focusGraph";
import type { GraphEdge } from "./buildGraph";

const edge = (id: string, source: string, target: string): GraphEdge => ({ id, source, target, label: "", color: "#fff" });

describe("focusGraph", () => {
  const edges = [edge("x1", "a", "b"), edge("x2", "c", "a"), edge("x3", "d", "e")];

  it("focuses nothing when no node is selected", () => {
    expect(focusGraph(edges, null)).toBeNull();
  });

  it("focuses nothing when the selected node is not in the graph", () => {
    expect(focusGraph(edges, "missing")).toBeNull();
  });

  it("focuses the selected node, its neighbours in both directions and their edges", () => {
    const focus = focusGraph(edges, "a");

    expect([...focus!.nodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...focus!.edgeIds].sort()).toEqual(["x1", "x2"]);
  });

  it("leaves unrelated nodes and edges out of the focus", () => {
    const focus = focusGraph(edges, "a");

    expect(focus!.nodeIds.has("d")).toBe(false);
    expect(focus!.edgeIds.has("x3")).toBe(false);
  });
});

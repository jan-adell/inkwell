import { describe, it, expect } from "vitest";
import { layoutGraph } from "./layoutGraph";
import type { GraphEdge, GraphNode } from "./buildGraph";

const node = (id: string): GraphNode => ({ id, name: id, color: "#fff" });
const edge = (id: string, source: string, target: string): GraphEdge => ({ id, source, target, label: "", color: "#fff" });

describe("layoutGraph", () => {
  it("returns no positions for an empty graph", () => {
    expect(layoutGraph([], [])).toEqual({});
  });

  it("positions every node at finite coordinates", () => {
    const positions = layoutGraph([node("a"), node("b"), node("c")], [edge("x", "a", "b")]);

    expect(Object.keys(positions).sort()).toEqual(["a", "b", "c"]);
    Object.values(positions).forEach(({ x, y }) => {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    });
  });

  it("does not stack nodes on the same spot", () => {
    const positions = layoutGraph([node("a"), node("b")], []);

    expect(positions.a).not.toEqual(positions.b);
  });

  it("is deterministic for the same input", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("x", "a", "b"), edge("y", "b", "c")];

    expect(layoutGraph(nodes, edges)).toEqual(layoutGraph(nodes, edges));
  });
});

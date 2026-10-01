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

  it("leaves room between linked nodes for the relation label", () => {
    const positions = layoutGraph([node("a"), node("b")], [edge("x", "a", "b")]);

    const distance = Math.hypot(positions.a.x - positions.b.x, positions.a.y - positions.b.y);

    expect(distance).toBeGreaterThanOrEqual(240);
  });

  it("keeps a crowded graph free of overlapping nodes", () => {
    const names = ["harlod", "silvia", "carl", "jenna", "jim", "forge", "mira"];
    const links: [string, string][] = [
      ["harlod", "forge"], ["silvia", "forge"], ["carl", "forge"], ["jenna", "forge"],
      ["jim", "forge"], ["jenna", "harlod"], ["harlod", "carl"], ["jenna", "jim"], ["mira", "silvia"],
    ];

    const positions = layoutGraph(
      names.map(node),
      links.map(([source, target], index) => edge(`x${index}`, source, target)),
    );

    const ids = Object.keys(positions);
    ids.forEach((first, index) =>
      ids.slice(index + 1).forEach((second) => {
        const distance = Math.hypot(positions[first].x - positions[second].x, positions[first].y - positions[second].y);
        expect(distance, `${first} vs ${second}`).toBeGreaterThanOrEqual(180);
      }),
    );
  });

  it("is deterministic for the same input", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("x", "a", "b"), edge("y", "b", "c")];

    expect(layoutGraph(nodes, edges)).toEqual(layoutGraph(nodes, edges));
  });
});

import { describe, it, expect } from "vitest";
import { curveOffsets, edgePath, floatingEndpoints, PARALLEL_SPACING, rectBorderPoint } from "./edgeGeometry";
import type { GraphEdge } from "./buildGraph";

const rect = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });
const edge = (id: string, source: string, target: string): GraphEdge => ({ id, source, target, label: "", color: "#fff" });

describe("rectBorderPoint", () => {
  const box = rect(-50, -20);

  it("leaves through the right side towards a node on the right", () => {
    expect(rectBorderPoint(box, { x: 200, y: 0 })).toEqual({ x: 50, y: 0 });
  });

  it("leaves through the bottom towards a node below", () => {
    expect(rectBorderPoint(box, { x: 0, y: 100 })).toEqual({ x: 0, y: 20 });
  });

  it("leaves through the corner region along the diagonal", () => {
    expect(rectBorderPoint(box, { x: 100, y: 100 })).toEqual({ x: 20, y: 20 });
  });
});

describe("degenerate geometry", () => {
  it("returns the node center when the target sits exactly on it", () => {
    expect(rectBorderPoint(rect(-50, -20), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("keeps a bowed edge between coincident points finite", () => {
    const { path, labelX, labelY } = edgePath({ x: 10, y: 10 }, { x: 10, y: 10 }, 20);

    expect(path).toBe("M 10 10 Q 10 10 10 10");
    expect([labelX, labelY]).toEqual([10, 10]);
  });
});

describe("floatingEndpoints", () => {
  it("connects the facing borders of two nodes on the same row", () => {
    const { start, end } = floatingEndpoints(rect(0, 0), rect(300, 0));

    expect(start).toEqual({ x: 100, y: 20 });
    expect(end).toEqual({ x: 300, y: 20 });
  });

  it("connects the facing borders of two stacked nodes", () => {
    const { start, end } = floatingEndpoints(rect(0, 0), rect(0, 200));

    expect(start).toEqual({ x: 50, y: 40 });
    expect(end).toEqual({ x: 50, y: 200 });
  });
});

describe("curveOffsets", () => {
  it("keeps a lone relation straight", () => {
    expect(curveOffsets([edge("x", "a", "b")])).toEqual({ x: 0 });
  });

  it("spreads parallel relations symmetrically", () => {
    const offsets = curveOffsets([edge("x", "a", "b"), edge("y", "a", "b"), edge("z", "a", "b")]);

    expect(offsets.y).toBe(0);
    expect(offsets.x).toBe(-offsets.z);
    expect(Math.abs(offsets.x)).toBe(PARALLEL_SPACING);
  });

  it("does not mix up relations of different entity pairs", () => {
    const offsets = curveOffsets([edge("x", "a", "b"), edge("y", "a", "c")]);

    expect(offsets).toEqual({ x: 0, y: 0 });
  });

  it("separates relations running in opposite directions between the same pair", () => {
    const offsets = curveOffsets([edge("x", "a", "b"), edge("y", "b", "a")]);
    const forward = edgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, offsets.x);
    const backward = edgePath({ x: 100, y: 0 }, { x: 0, y: 0 }, offsets.y);

    expect(forward.labelY).not.toBe(backward.labelY);
  });
});

describe("edgePath", () => {
  it("draws a straight line with the label at its middle when there is no offset", () => {
    const { path, labelX, labelY } = edgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);

    expect(path).toBe("M 0 0 L 100 0");
    expect([labelX, labelY]).toEqual([50, 0]);
  });

  it("bows the line and moves the label sideways by the offset", () => {
    const { path, labelX, labelY } = edgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);

    expect(path).toBe("M 0 0 Q 50 40 100 0");
    expect([labelX, labelY]).toEqual([50, 20]);
  });
});

import { describe, it, expect } from "vitest";
import { avoidObstacles, curveOffsets, edgePath, floatingEndpoints, PARALLEL_SPACING, rectBorderPoint, sampleEdge } from "./edgeGeometry";
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

describe("avoidObstacles", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 400, y: 0 };
  const blocker = rect(150, -20, 100, 40);

  const insideAny = (offset: number, obstacles: ReturnType<typeof rect>[]) =>
    sampleEdge(start, end, offset, 40).some((point) =>
      obstacles.some(
        (box) => point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height,
      ),
    );

  it("keeps the base offset when nothing is in the way", () => {
    expect(avoidObstacles(start, end, 0, [])).toBe(0);
    expect(avoidObstacles(start, end, 0, [rect(150, 100, 100, 40)])).toBe(0);
  });

  it("bends a straight edge around a node sitting on it", () => {
    const offset = avoidObstacles(start, end, 0, [blocker]);

    expect(offset).not.toBe(0);
    expect(insideAny(offset, [blocker])).toBe(false);
  });

  it("keeps a parallel offset that is already clear", () => {
    expect(avoidObstacles(start, end, 30, [blocker])).toBe(30);
  });

  it("clears several blocking nodes at once", () => {
    const blockers = [blocker, rect(40, -20, 60, 40), rect(300, -30, 60, 60)];

    const offset = avoidObstacles(start, end, 0, blockers);

    expect(insideAny(offset, blockers)).toBe(false);
  });

  it("falls back to the base offset when no bend can clear the obstacles", () => {
    const wall = rect(150, -2000, 100, 4000);

    expect(avoidObstacles(start, end, 0, [wall])).toBe(0);
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

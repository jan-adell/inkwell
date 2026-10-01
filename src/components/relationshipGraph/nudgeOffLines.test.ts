import { describe, it, expect } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH, nudgeOffLines, segmentHitsRect } from "./nudgeOffLines";
import type { GraphEdge } from "./buildGraph";

const edge = (id: string, source: string, target: string): GraphEdge => ({ id, source, target, label: "", color: "#fff" });
const boxAround = (center: { x: number; y: number }) => ({
  x: center.x - NODE_WIDTH / 2,
  y: center.y - NODE_HEIGHT / 2,
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
});

describe("segmentHitsRect", () => {
  const box = { x: 0, y: 0, width: 100, height: 50 };

  it("detects a segment crossing the box", () => {
    expect(segmentHitsRect({ x: -50, y: 25 }, { x: 150, y: 25 }, box)).toBe(true);
  });

  it("detects a segment that ends inside the box", () => {
    expect(segmentHitsRect({ x: -50, y: 25 }, { x: 50, y: 25 }, box)).toBe(true);
  });

  it("ignores a segment passing beside the box", () => {
    expect(segmentHitsRect({ x: -50, y: 80 }, { x: 150, y: 80 }, box)).toBe(false);
  });

  it("ignores a segment that stops short of the box", () => {
    expect(segmentHitsRect({ x: -50, y: 25 }, { x: -10, y: 25 }, box)).toBe(false);
  });

  it("handles vertical and diagonal segments", () => {
    expect(segmentHitsRect({ x: 50, y: -40 }, { x: 50, y: 90 }, box)).toBe(true);
    expect(segmentHitsRect({ x: -40, y: -40 }, { x: 140, y: 90 }, box)).toBe(true);
    expect(segmentHitsRect({ x: -40, y: 90 }, { x: 140, y: 140 }, box)).toBe(false);
  });
});

describe("nudgeOffLines", () => {
  const links = [edge("x", "a", "b")];

  it("leaves nodes alone when no line crosses them", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, c: { x: 300, y: 300 } };

    expect(nudgeOffLines(positions, links)).toEqual(positions);
  });

  it("moves a node sitting on a line of two other nodes off that line", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, c: { x: 300, y: 4 } };

    const nudged = nudgeOffLines(positions, links);

    expect(segmentHitsRect(nudged.a, nudged.b, boxAround(nudged.c))).toBe(false);
    expect(nudged.c.x).toBeCloseTo(300);
    expect(Math.abs(nudged.c.y)).toBeGreaterThan(NODE_HEIGHT / 2);
  });

  it("pushes a node dead-center on the line sideways instead of leaving it", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, c: { x: 300, y: 0 } };

    const nudged = nudgeOffLines(positions, links);

    expect(segmentHitsRect(nudged.a, nudged.b, boxAround(nudged.c))).toBe(false);
  });

  it("never moves the endpoints of the line itself", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, c: { x: 300, y: 0 } };

    const nudged = nudgeOffLines(positions, links);

    expect(nudged.a).toEqual(positions.a);
    expect(nudged.b).toEqual(positions.b);
  });

  it("does not move a node because of its own relations", () => {
    const positions = { a: { x: 0, y: 0 }, c: { x: 80, y: 0 } };

    expect(nudgeOffLines(positions, [edge("x", "a", "c")])).toEqual(positions);
  });

  it("does not modify its input", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, c: { x: 300, y: 0 } };
    const snapshot = JSON.parse(JSON.stringify(positions));

    nudgeOffLines(positions, links);

    expect(positions).toEqual(snapshot);
  });

  it("clears several nodes crowding the same line", () => {
    const positions = {
      a: { x: 0, y: 0 },
      b: { x: 900, y: 0 },
      c: { x: 300, y: 5 },
      d: { x: 600, y: -5 },
    };

    const nudged = nudgeOffLines(positions, links);

    ["c", "d"].forEach((id) =>
      expect(segmentHitsRect(nudged.a, nudged.b, boxAround(nudged[id as "c" | "d"])), id).toBe(false),
    );
  });

  it("is deterministic", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, c: { x: 300, y: 0 } };

    expect(nudgeOffLines(positions, links)).toEqual(nudgeOffLines(positions, links));
  });
});

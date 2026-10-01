import type { GraphEdge } from "./buildGraph";
import type { Point, Rect } from "./edgeGeometry";

export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 50;

const LINE_MARGIN = 12;
const STEP = 10;
const MAX_STEPS = 80;
const MAX_PASSES = 20;

export function segmentHitsRect(from: Point, to: Point, box: Rect): boolean {
  let enter = 0;
  let leave = 1;
  const clip = (direction: number, distance: number) => {
    if (direction === 0) return distance >= 0;
    const ratio = distance / direction;
    if (direction < 0) {
      if (ratio > leave) return false;
      enter = Math.max(enter, ratio);
    } else {
      if (ratio < enter) return false;
      leave = Math.min(leave, ratio);
    }
    return true;
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (
    clip(-dx, from.x - box.x) &&
    clip(dx, box.x + box.width - from.x) &&
    clip(-dy, from.y - box.y) &&
    clip(dy, box.y + box.height - from.y)
  );
}

const boxAround = (center: Point): Rect => ({
  x: center.x - NODE_WIDTH / 2 - LINE_MARGIN,
  y: center.y - NODE_HEIGHT / 2 - LINE_MARGIN,
  width: NODE_WIDTH + 2 * LINE_MARGIN,
  height: NODE_HEIGHT + 2 * LINE_MARGIN,
});

function awayFromSegment(center: Point, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = Math.max(0, Math.min(1, ((center.x - from.x) * dx + (center.y - from.y) * dy) / lengthSquared));
  const away = { x: center.x - (from.x + along * dx), y: center.y - (from.y + along * dy) };
  const distance = Math.hypot(away.x, away.y);
  if (distance > 1e-6) return { x: away.x / distance, y: away.y / distance };

  const length = Math.sqrt(lengthSquared);
  return { x: -dy / length, y: dx / length };
}

export function nudgeOffLines(
  positions: Record<string, Point>,
  edges: GraphEdge[],
): Record<string, Point> {
  const result: Record<string, Point> = Object.fromEntries(
    Object.entries(positions).map(([id, point]) => [id, { ...point }]),
  );
  const lines = edges.filter(
    (edge) => edge.source !== edge.target && positions[edge.source] && positions[edge.target],
  );

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (const id of Object.keys(result)) {
      for (const line of lines) {
        if (line.source === id || line.target === id) continue;
        const from = result[line.source];
        const to = result[line.target];
        if (from.x === to.x && from.y === to.y) continue;
        if (!segmentHitsRect(from, to, boxAround(result[id]))) continue;

        const direction = awayFromSegment(result[id], from, to);
        for (let step = 0; step < MAX_STEPS && segmentHitsRect(from, to, boxAround(result[id])); step++) {
          result[id] = { x: result[id].x + direction.x * STEP, y: result[id].y + direction.y * STEP };
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return result;
}

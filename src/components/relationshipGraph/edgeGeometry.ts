import type { GraphEdge } from "./buildGraph";

export const PARALLEL_SPACING = 60;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const center = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

export function rectBorderPoint(rect: Rect, toward: Point): Point {
  const middle = center(rect);
  const dx = toward.x - middle.x;
  const dy = toward.y - middle.y;
  const scale = Math.min(rect.width / 2 / Math.abs(dx), rect.height / 2 / Math.abs(dy));
  if (!Number.isFinite(scale)) return middle;
  return { x: middle.x + dx * scale, y: middle.y + dy * scale };
}

export function floatingEndpoints(source: Rect, target: Rect): { start: Point; end: Point } {
  return {
    start: rectBorderPoint(source, center(target)),
    end: rectBorderPoint(target, center(source)),
  };
}

export function curveOffsets(edges: GraphEdge[]): Record<string, number> {
  const groups = new Map<string, GraphEdge[]>();
  edges.forEach((edge) => {
    const key = [edge.source, edge.target].sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  });

  const offsets: Record<string, number> = {};
  groups.forEach((group) => {
    group.forEach((edge, index) => {
      const spread = (index - (group.length - 1) / 2) * PARALLEL_SPACING;
      const alongCanonicalDirection = edge.source <= edge.target;
      offsets[edge.id] = (alongCanonicalDirection ? spread : -spread) + 0;
    });
  });
  return offsets;
}

export function edgePath(start: Point, end: Point, offset: number): { path: string; labelX: number; labelY: number } {
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  if (offset === 0) {
    return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, labelX: middle.x, labelY: middle.y };
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const control = { x: middle.x + normal.x * offset * 2, y: middle.y + normal.y * offset * 2 };

  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    labelX: middle.x + normal.x * offset,
    labelY: middle.y + normal.y * offset,
  };
}

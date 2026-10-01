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

function bowControl(start: Point, end: Point, offset: number): { middle: Point; normal: Point; control: Point } {
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const control = { x: middle.x + normal.x * offset * 2, y: middle.y + normal.y * offset * 2 };
  return { middle, normal, control };
}

export function edgePath(start: Point, end: Point, offset: number): { path: string; labelX: number; labelY: number } {
  const { middle, normal, control } = bowControl(start, end, offset);
  if (offset === 0) {
    return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, labelX: middle.x, labelY: middle.y };
  }

  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    labelX: middle.x + normal.x * offset,
    labelY: middle.y + normal.y * offset,
  };
}

export function sampleEdge(start: Point, end: Point, offset: number, count: number): Point[] {
  const { control } = bowControl(start, end, offset);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const u = 1 - t;
    return {
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
    };
  });
}

const OBSTACLE_MARGIN = 6;
const BEND_STEP = 30;
const MAX_BENDS = 12;
const SAMPLES = 40;

const isInside = (point: Point, box: Rect) =>
  point.x > box.x - OBSTACLE_MARGIN &&
  point.x < box.x + box.width + OBSTACLE_MARGIN &&
  point.y > box.y - OBSTACLE_MARGIN &&
  point.y < box.y + box.height + OBSTACLE_MARGIN;

export function avoidObstacles(start: Point, end: Point, baseOffset: number, obstacles: Rect[]): number {
  const isClear = (offset: number) =>
    sampleEdge(start, end, offset, SAMPLES).every((point) => !obstacles.some((box) => isInside(point, box)));

  if (isClear(baseOffset)) return baseOffset;

  for (let bend = 1; bend <= MAX_BENDS; bend++) {
    for (const candidate of [baseOffset + bend * BEND_STEP, baseOffset - bend * BEND_STEP]) {
      if (isClear(candidate)) return candidate;
    }
  }
  return baseOffset;
}

import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge, GraphNode } from "./buildGraph";
import { nudgeOffLines } from "./nudgeOffLines";

export interface Position {
  x: number;
  y: number;
}

const TICKS = 300;
const LINK_DISTANCE = 280;
const REPULSION = -900;
const NODE_RADIUS = 100;
const RELAX_ROUNDS = 12;
const RELAX_TICKS = 40;
const CONVERGED_DISTANCE = 0.5;

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Record<string, Position> {
  const simulated: (SimulationNodeDatum & { id: string })[] = nodes.map(({ id }) => ({ id }));
  const links = edges.map(({ source, target }) => ({ source, target }));

  forceSimulation(simulated)
    .force("link", forceLink(links).id((datum) => (datum as { id: string }).id).distance(LINK_DISTANCE))
    .force("charge", forceManyBody().strength(REPULSION))
    .force("collide", forceCollide(NODE_RADIUS))
    .force("center", forceCenter(0, 0))
    .stop()
    .tick(TICKS);

  const settled = Object.fromEntries(simulated.map(({ id, x, y }) => [id, { x: x ?? 0, y: y ?? 0 }]));
  return clearLinesAndOverlaps(settled, edges);
}

function separate(positions: Record<string, Position>): Record<string, Position> {
  const movable = Object.entries(positions).map(([id, point]) => ({ id, ...point }));
  forceSimulation(movable).force("collide", forceCollide(NODE_RADIUS)).stop().tick(RELAX_TICKS);
  return Object.fromEntries(movable.map(({ id, x, y }) => [id, { x, y }]));
}

function hasConverged(before: Record<string, Position>, after: Record<string, Position>): boolean {
  return Object.keys(before).every(
    (id) => Math.hypot(before[id].x - after[id].x, before[id].y - after[id].y) < CONVERGED_DISTANCE,
  );
}

function clearLinesAndOverlaps(positions: Record<string, Position>, edges: GraphEdge[]): Record<string, Position> {
  let current = positions;
  for (let round = 0; round < RELAX_ROUNDS; round++) {
    const nudged = nudgeOffLines(current, edges);
    const separated = separate(nudged);
    if (hasConverged(nudged, separated)) return nudged;
    current = separated;
  }
  return nudgeOffLines(current, edges);
}

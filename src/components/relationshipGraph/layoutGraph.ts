import { forceCenter, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge, GraphNode } from "./buildGraph";

export interface Position {
  x: number;
  y: number;
}

const TICKS = 300;
const LINK_DISTANCE = 280;
const REPULSION = -900;

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Record<string, Position> {
  const simulated: (SimulationNodeDatum & { id: string })[] = nodes.map(({ id }) => ({ id }));
  const links = edges.map(({ source, target }) => ({ source, target }));

  forceSimulation(simulated)
    .force("link", forceLink(links).id((datum) => (datum as { id: string }).id).distance(LINK_DISTANCE))
    .force("charge", forceManyBody().strength(REPULSION))
    .force("center", forceCenter(0, 0))
    .stop()
    .tick(TICKS);

  return Object.fromEntries(simulated.map(({ id, x, y }) => [id, { x: x ?? 0, y: y ?? 0 }]));
}

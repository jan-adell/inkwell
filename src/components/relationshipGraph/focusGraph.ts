import type { GraphEdge } from "./buildGraph";

export interface GraphFocus {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

export function focusGraph(edges: GraphEdge[], selectedId: string | null): GraphFocus | null {
  if (!selectedId) return null;

  const connected = edges.filter((edge) => edge.source === selectedId || edge.target === selectedId);
  if (connected.length === 0) return null;

  return {
    nodeIds: new Set([selectedId, ...connected.flatMap((edge) => [edge.source, edge.target])]),
    edgeIds: new Set(connected.map((edge) => edge.id)),
  };
}

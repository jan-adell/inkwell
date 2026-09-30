import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { invokeListRelations, invokeListRelationTypes } from "../../hooks/useTauri";
import type { Relation } from "../../types/core";
import { buildGraph } from "./buildGraph";
import { layoutGraph } from "./layoutGraph";

export function RelationshipGraph() {
  const {
    projectId,
    rootEntities,
    entitiesByFolder,
    entityTypes,
    relationTypes,
    setRelationTypes,
    setSelectedEntityId,
  } = useAppStore();
  const [relations, setRelations] = useState<Relation[] | null>(null);

  useEffect(() => {
    if (!projectId) return;
    invokeListRelations(projectId).then(setRelations).catch(console.error);
    invokeListRelationTypes(projectId).then(setRelationTypes).catch(console.error);
  }, [projectId, setRelationTypes]);

  const { nodes, edges } = useMemo(() => {
    const entities = [...rootEntities, ...Object.values(entitiesByFolder).flat()];
    const graph = buildGraph({ entities, relations: relations ?? [], relationTypes, entityTypes });
    const positions = layoutGraph(graph.nodes, graph.edges);

    const flowNodes: Node[] = graph.nodes.map((node) => ({
      id: node.id,
      position: positions[node.id],
      data: { label: node.name },
      style: { border: `2px solid ${node.color}`, background: "var(--ink-surface, #1c1c1c)", color: "inherit" },
    }));
    const flowEdges: Edge[] = graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      style: { stroke: edge.color },
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.color },
    }));
    return { nodes: flowNodes, edges: flowEdges };
  }, [rootEntities, entitiesByFolder, entityTypes, relationTypes, relations]);

  if (relations !== null && relations.length === 0) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-ink-void">
        <Network size={32} className="text-ivory-ghost opacity-20 mx-auto mb-3" />
        <p className="text-sm text-ivory-ghost">No relations yet. Add relations to an entity to see them here.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-ink-void">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesConnectable={false}
        nodesDraggable={false}
        fitView
        colorMode="dark"
        onNodeClick={(_, node) => setSelectedEntityId(node.id)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </main>
  );
}

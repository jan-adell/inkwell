import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { invokeListRelations, invokeListRelationTypes } from "../../hooks/useTauri";
import type { Relation } from "../../types/core";
import { buildGraph } from "./buildGraph";
import { focusGraph } from "./focusGraph";
import { edgeLabelProps, edgeStyle, nodeStyle } from "./graphStyle";
import { layoutGraph } from "./layoutGraph";

export function RelationshipGraph() {
  const {
    projectId,
    rootEntities,
    entitiesByFolder,
    entityTypes,
    relationTypes,
    selectedEntityId,
    setRelationTypes,
    setSelectedEntityId,
  } = useAppStore();
  const [relations, setRelations] = useState<Relation[] | null>(null);

  useEffect(() => {
    if (!projectId) return;
    invokeListRelations(projectId).then(setRelations).catch(console.error);
    invokeListRelationTypes(projectId).then(setRelationTypes).catch(console.error);
  }, [projectId, setRelationTypes]);

  const { graph, positions } = useMemo(() => {
    const entities = [...rootEntities, ...Object.values(entitiesByFolder).flat()];
    const built = buildGraph({ entities, relations: relations ?? [], relationTypes, entityTypes });
    return { graph: built, positions: layoutGraph(built.nodes, built.edges) };
  }, [rootEntities, entitiesByFolder, entityTypes, relationTypes, relations]);

  const { nodes, edges } = useMemo(() => {
    const focus = focusGraph(graph.edges, selectedEntityId);

    const flowNodes: Node[] = graph.nodes.map((node) => ({
      id: node.id,
      position: positions[node.id],
      data: { label: node.name },
      style: nodeStyle(node.color, {
        selected: node.id === selectedEntityId,
        dimmed: focus !== null && !focus.nodeIds.has(node.id),
      }),
    }));
    const flowEdges: Edge[] = graph.edges.map((edge) => {
      const dimmed = focus !== null && !focus.edgeIds.has(edge.id);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        style: edgeStyle(edge.color, { focused: focus?.edgeIds.has(edge.id) ?? false, dimmed }),
        ...edgeLabelProps({ dimmed }),
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.color, width: 18, height: 18 },
      };
    });
    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, positions, selectedEntityId]);

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
        onPaneClick={() => setSelectedEntityId(null)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </main>
  );
}

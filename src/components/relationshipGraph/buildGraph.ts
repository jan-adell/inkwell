import type { Entity, EntityType, Relation, RelationType } from "../../types/core";

export const DEFAULT_NODE_COLOR = "#c9a84c";
export const DEFAULT_EDGE_COLOR = "#8a8578";

export interface GraphNode {
  id: string;
  name: string;
  color: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  color: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphSources {
  entities: Entity[];
  relations: Relation[];
  relationTypes: RelationType[];
  entityTypes: EntityType[];
}

export function buildGraph({ entities, relations, relationTypes, entityTypes }: GraphSources): GraphData {
  const typeColors = new Map(entityTypes.map((type) => [type.id, type.color]));
  const relationTypesById = new Map(relationTypes.map((type) => [type.id, type]));
  const entityIds = new Set(entities.map((entity) => entity.id));

  const nodes = entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    color: typeColors.get(entity.entity_type_id) ?? DEFAULT_NODE_COLOR,
  }));

  const edges = relations.flatMap((relation) => {
    const relationType = relationTypesById.get(relation.relation_type_id);
    const endpointsKnown = entityIds.has(relation.source_entity_id) && entityIds.has(relation.target_entity_id);
    if (!relationType || !endpointsKnown) return [];
    return [{
      id: relation.id,
      source: relation.source_entity_id,
      target: relation.target_entity_id,
      label: relationType.label,
      color: relationType.color ?? DEFAULT_EDGE_COLOR,
    }];
  });

  return { nodes, edges };
}

import { describe, it, expect } from "vitest";
import { buildGraph, DEFAULT_NODE_COLOR, DEFAULT_EDGE_COLOR } from "./buildGraph";
import type { Entity, EntityType, Relation, RelationType } from "../../types/core";

const entity = (id: string, name: string, entity_type_id: string) =>
  ({ id, name, entity_type_id }) as Entity;
const entityType = (id: string, color: string | null) => ({ id, color }) as EntityType;
const relationType = (id: string, label: string, color: string | null) =>
  ({ id, label, color }) as RelationType;
const relation = (id: string, source: string, type: string, target: string) =>
  ({ id, source_entity_id: source, relation_type_id: type, target_entity_id: target }) as Relation;

describe("buildGraph", () => {
  const entities = [entity("e1", "Kael", "t1"), entity("e2", "Valthera", "t2")];
  const entityTypes = [entityType("t1", "#ff0000"), entityType("t2", null)];
  const relationTypes = [relationType("r1", "Lives in", "#00ff00"), relationType("r2", "Ally of", null)];

  it("maps entities to nodes colored by their entity type", () => {
    const { nodes } = buildGraph({ entities, relations: [], relationTypes, entityTypes });

    expect(nodes).toEqual([
      { id: "e1", name: "Kael", color: "#ff0000" },
      { id: "e2", name: "Valthera", color: DEFAULT_NODE_COLOR },
    ]);
  });

  it("maps relations to labelled edges colored by their relation type", () => {
    const relations = [relation("x1", "e1", "r1", "e2"), relation("x2", "e2", "r2", "e1")];

    const { edges } = buildGraph({ entities, relations, relationTypes, entityTypes });

    expect(edges).toEqual([
      { id: "x1", source: "e1", target: "e2", label: "Lives in", color: "#00ff00" },
      { id: "x2", source: "e2", target: "e1", label: "Ally of", color: DEFAULT_EDGE_COLOR },
    ]);
  });

  it("drops relations whose endpoint entity is unknown", () => {
    const relations = [relation("x1", "e1", "r1", "missing")];

    const { edges } = buildGraph({ entities, relations, relationTypes, entityTypes });

    expect(edges).toEqual([]);
  });

  it("drops relations whose relation type is unknown", () => {
    const relations = [relation("x1", "e1", "missing", "e2")];

    const { edges } = buildGraph({ entities, relations, relationTypes, entityTypes });

    expect(edges).toEqual([]);
  });
});

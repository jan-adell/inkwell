import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeListRelationTypes,
  invokeCreateRelationType,
  invokeCreateRelation,
  invokeDeleteRelation,
  invokeListOutgoingRelations,
  invokeListIncomingRelations,
} from "../hooks/useTauri";
import type { Entity, Relation } from "../types/core";

const NEW_PAIR = "__new__";

function messageFor(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong.";
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function allEntitiesFromStore(): Entity[] {
  const state = useAppStore.getState();
  return [
    ...state.rootEntities,
    ...Object.values(state.entitiesByFolder).flat(),
  ];
}

interface RelationRow {
  relation: Relation;
  roleLabel: string;
  otherEntityId: string;
}

function AddRelationForm({
  entity,
  onCreated,
  onCancel,
}: {
  entity: Entity;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { projectId, relationTypes, addRelationType } = useAppStore();
  const [otherQuery, setOtherQuery] = useState("");
  const [otherEntity, setOtherEntity] = useState<Entity | null>(null);
  const [typeChoice, setTypeChoice] = useState<string>("");
  const [newRoleMine, setNewRoleMine] = useState("");
  const [newRoleTheirs, setNewRoleTheirs] = useState("");
  const [roleAssignment, setRoleAssignment] = useState<"label" | "inverse_label" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allEntities = allEntitiesFromStore().filter((e) => e.id !== entity.id);
  const matches = otherQuery.trim() && !otherEntity
    ? allEntities.filter((e) => e.name.toLowerCase().includes(otherQuery.toLowerCase()))
    : [];

  const selectedType = relationTypes.find((t) => t.id === typeChoice);
  const isAsymmetric = !!selectedType?.inverse_label && selectedType.inverse_label !== selectedType.label;

  async function submit() {
    if (!otherEntity) {
      setError("Pick the other entity.");
      return;
    }
    setError(null);

    try {
      let relationTypeId: string;
      let currentRole: "label" | "inverse_label" = "label";

      if (typeChoice === NEW_PAIR) {
        const mine = newRoleMine.trim();
        const theirs = newRoleTheirs.trim();
        if (!mine || !theirs) {
          setError("Enter a role for both entities.");
          return;
        }
        const created = await invokeCreateRelationType(projectId ?? "", {
          name: `${slugify(mine)}_${slugify(theirs)}`,
          label: mine,
          inverse_label: theirs,
        });
        addRelationType(created);
        relationTypeId = created.id;
        currentRole = "label";
      } else {
        if (!selectedType) {
          setError("Pick a role pair.");
          return;
        }
        if (isAsymmetric && !roleAssignment) {
          setError("Choose which role this entity has.");
          return;
        }
        relationTypeId = selectedType.id;
        currentRole = isAsymmetric ? (roleAssignment as "label" | "inverse_label") : "label";
      }

      const sourceId = currentRole === "label" ? entity.id : otherEntity.id;
      const targetId = currentRole === "label" ? otherEntity.id : entity.id;

      await invokeCreateRelation(projectId ?? "", {
        source_entity_id: sourceId,
        relation_type_id: relationTypeId,
        target_entity_id: targetId,
      });
      onCreated();
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {!otherEntity ? (
        <>
          <input
            value={otherQuery}
            onChange={(e) => setOtherQuery(e.target.value)}
            placeholder="Search for the other entity…"
            className="w-full bg-ink-muted text-ivory text-sm px-2 py-1 rounded focus:outline-none"
          />
          {matches.length > 0 && (
            <div className="border border-ink-border rounded max-h-32 overflow-y-auto">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setOtherEntity(m); setOtherQuery(""); }}
                  className="w-full text-left px-2 py-1 text-xs text-ivory hover:bg-ink-muted transition-colors"
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between bg-ink-muted rounded px-2 py-1">
          <span className="text-xs text-ivory">{otherEntity.name}</span>
          <button
            onClick={() => { setOtherEntity(null); setTypeChoice(""); setRoleAssignment(null); }}
            className="text-xs text-ivory-ghost hover:text-ivory"
          >
            Change
          </button>
        </div>
      )}

      {otherEntity && (
        <select
          value={typeChoice}
          onChange={(e) => { setTypeChoice(e.target.value); setRoleAssignment(null); setError(null); }}
          className="w-full bg-ink-muted text-ivory text-xs px-2 py-1 rounded focus:outline-none"
        >
          <option value="">Select a role pair…</option>
          {relationTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.inverse_label && t.inverse_label !== t.label ? `${t.label} ↔ ${t.inverse_label}` : t.label}
            </option>
          ))}
          <option value={NEW_PAIR}>+ New role pair…</option>
        </select>
      )}

      {otherEntity && typeChoice === NEW_PAIR && (
        <div className="space-y-1">
          <input
            value={newRoleMine}
            onChange={(e) => setNewRoleMine(e.target.value)}
            placeholder="This entity's role (e.g. Father)"
            className="w-full bg-ink-muted text-ivory text-xs px-2 py-1 rounded focus:outline-none"
          />
          <input
            value={newRoleTheirs}
            onChange={(e) => setNewRoleTheirs(e.target.value)}
            placeholder={`${otherEntity.name}'s role (e.g. Son)`}
            className="w-full bg-ink-muted text-ivory text-xs px-2 py-1 rounded focus:outline-none"
          />
        </div>
      )}

      {otherEntity && selectedType && isAsymmetric && (
        <div className="flex gap-2">
          <button
            onClick={() => setRoleAssignment("label")}
            className={`flex-1 text-xs px-2 py-1 rounded transition-colors ${roleAssignment === "label" ? "bg-gold/30 text-gold" : "bg-ink-muted text-ivory-ghost hover:text-ivory"}`}
          >
            {entity.name} is the {selectedType.label}
          </button>
          <button
            onClick={() => setRoleAssignment("inverse_label")}
            className={`flex-1 text-xs px-2 py-1 rounded transition-colors ${roleAssignment === "inverse_label" ? "bg-gold/30 text-gold" : "bg-ink-muted text-ivory-ghost hover:text-ivory"}`}
          >
            {entity.name} is the {selectedType.inverse_label}
          </button>
        </div>
      )}

      {error && <p className="text-[10px] text-crimson">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void submit()}
          className="flex-1 text-xs bg-gold/20 text-gold rounded py-0.5 hover:bg-gold/30"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="flex-1 text-xs text-ivory-ghost rounded py-0.5 hover:bg-ink-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EntityRelationsSection({ entity }: { entity: Entity }) {
  const { projectId, relationTypes, setRelationTypes, setSelectedEntityId } = useAppStore();
  const [outgoing, setOutgoing] = useState<Relation[]>([]);
  const [incoming, setIncoming] = useState<Relation[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (relationTypes.length === 0 && projectId) {
      invokeListRelationTypes(projectId).then(setRelationTypes).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function loadRelations() {
    Promise.all([
      invokeListOutgoingRelations(entity.id),
      invokeListIncomingRelations(entity.id),
    ])
      .then(([out, inc]) => {
        setOutgoing(out);
        setIncoming(inc);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadRelations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  const allEntities = allEntitiesFromStore();
  const rows: RelationRow[] = [
    ...outgoing.map((r) => ({
      relation: r,
      roleLabel: relationTypes.find((t) => t.id === r.relation_type_id)?.label ?? "Related to",
      otherEntityId: r.target_entity_id,
    })),
    ...incoming.map((r) => {
      const type = relationTypes.find((t) => t.id === r.relation_type_id);
      return {
        relation: r,
        roleLabel: type?.inverse_label ?? type?.label ?? "Related to",
        otherEntityId: r.source_entity_id,
      };
    }),
  ];

  async function remove(relationId: string) {
    try {
      await invokeDeleteRelation(relationId);
      loadRelations();
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="border-t border-ink-border my-4" />
      <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-2">Relations</p>

      {rows.map(({ relation, roleLabel, otherEntityId }) => {
        const other = allEntities.find((e) => e.id === otherEntityId);
        return (
          <div
            key={relation.id}
            className="group grid grid-cols-[140px_1fr_auto] gap-2 items-center py-1.5 border-b border-ink-border/30"
          >
            <span className="text-xs text-ivory-ghost truncate">{roleLabel}</span>
            <button
              onClick={() => setSelectedEntityId(otherEntityId)}
              className="text-left text-sm text-ivory hover:text-gold transition-colors truncate"
            >
              {other?.name ?? "Unknown entity"}
            </button>
            <button
              onClick={() => void remove(relation.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all"
              title="Remove relation"
            >
              <Trash2 size={11} />
            </button>
          </div>
        );
      })}

      {open ? (
        <AddRelationForm
          entity={entity}
          onCreated={() => { setOpen(false); loadRelations(); }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 mt-3 text-xs text-ivory-ghost hover:text-ivory transition-colors"
        >
          <Plus size={12} />
          Add relation
        </button>
      )}
    </>
  );
}

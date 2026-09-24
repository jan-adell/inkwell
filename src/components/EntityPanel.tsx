import { useState, useEffect } from "react";
import { Search, ExternalLink } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeGetFieldValues,
  invokeListFieldDefinitions,
  invokeListEntityAssets,
  invokeReadEntityAsset,
  invokeListRelationTypes,
  invokeListOutgoingRelations,
  invokeListIncomingRelations,
} from "../hooks/useTauri";
import type { Entity, EntityAsset, EntityType, FieldDefinition, FieldValue, Relation } from "../types/core";

function getTextValue(fv: FieldValue): string {
  if (fv.value_text !== null) return fv.value_text;
  if (fv.value_date !== null) return fv.value_date;
  if (fv.value_number !== null) return String(fv.value_number);
  if (fv.value_boolean !== null) return fv.value_boolean ? "true" : "false";
  return "";
}

function getNumberUnit(fd: FieldDefinition): string {
  if (fd.field_type !== "number" || !fd.options) return "";
  try {
    const parsed = JSON.parse(fd.options) as { unit?: string };
    return parsed.unit ?? "";
  } catch {
    return "";
  }
}

function AssetThumb({ asset, label }: { asset: EntityAsset; label: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    invokeReadEntityAsset(asset.id)
      .then(setUrl)
      .catch(() => setUrl(null));
  }, [asset.id]);

  if (!url) return null;
  return <img src={url} alt={label} className="w-full max-h-32 object-cover rounded" />;
}

function allEntitiesFromStore(): Entity[] {
  const state = useAppStore.getState();
  return [
    ...state.rootEntities,
    ...Object.values(state.entitiesByFolder).flat(),
  ];
}

export function EntityPanel() {
  const {
    selectedEntityId,
    setSelectedEntityId,
    setActiveView,
    entityTypes,
    fieldDefinitionsByType,
    setFieldDefinitionsForType,
    projectId,
    relationTypes,
    setRelationTypes,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [fieldValues, setFieldValues] = useState<Map<string, FieldValue>>(new Map());
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [assets, setAssets] = useState<EntityAsset[]>([]);
  const [outgoingRelations, setOutgoingRelations] = useState<Relation[]>([]);
  const [incomingRelations, setIncomingRelations] = useState<Relation[]>([]);

  useEffect(() => {
    setAllEntities(allEntitiesFromStore());
  }, []);

  const entity: Entity | undefined = selectedEntityId
    ? allEntities.find((e) => e.id === selectedEntityId)
    : undefined;

  const entityType: EntityType | undefined = entity
    ? entityTypes.find((t) => t.id === entity.entity_type_id)
    : undefined;

  const fieldDefs: FieldDefinition[] = entity
    ? (fieldDefinitionsByType[entity.entity_type_id] ?? [])
    : [];

  useEffect(() => {
    if (!entity) return;
    const typeId = entity.entity_type_id;
    if (!fieldDefinitionsByType[typeId]) {
      invokeListFieldDefinitions(typeId)
        .then((defs) => setFieldDefinitionsForType(typeId, defs))
        .catch(console.error);
    }
  }, [entity?.entity_type_id]);

  useEffect(() => {
    if (!selectedEntityId) return;
    invokeGetFieldValues(selectedEntityId)
      .then((fvs) => {
        const m = new Map<string, FieldValue>();
        fvs.forEach((fv) => m.set(fv.field_def_id, fv));
        setFieldValues(m);
      })
      .catch(console.error);
  }, [selectedEntityId]);

  useEffect(() => {
    if (!selectedEntityId) { setAssets([]); return; }
    invokeListEntityAssets(selectedEntityId)
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [selectedEntityId]);

  useEffect(() => {
    if (relationTypes.length === 0 && projectId) {
      invokeListRelationTypes(projectId).then(setRelationTypes).catch(() => {});
    }
  }, [projectId]);

  useEffect(() => {
    if (!selectedEntityId) { setOutgoingRelations([]); setIncomingRelations([]); return; }
    invokeListOutgoingRelations(selectedEntityId).then(setOutgoingRelations).catch(() => {});
    invokeListIncomingRelations(selectedEntityId).then(setIncomingRelations).catch(() => {});
  }, [selectedEntityId]);

  const relationRows = [
    ...outgoingRelations.map((r) => ({
      relation: r,
      roleLabel: relationTypes.find((t) => t.id === r.relation_type_id)?.label ?? "Related to",
      otherEntityId: r.target_entity_id,
    })),
    ...incomingRelations.map((r) => {
      const type = relationTypes.find((t) => t.id === r.relation_type_id);
      return {
        relation: r,
        roleLabel: type?.inverse_label ?? type?.label ?? "Related to",
        otherEntityId: r.source_entity_id,
      };
    }),
  ];

  const filtered = searchQuery.trim()
    ? allEntities.filter((e) =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-ink-border flex items-center gap-2">
        <Search size={12} className="text-ivory-ghost flex-shrink-0" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search entities…"
          className="flex-1 bg-transparent text-ivory text-xs focus:outline-none placeholder-ivory-ghost"
        />
        {entity && (
          <button
            onClick={() => setActiveView("worldbuilding")}
            title="Edit in World view"
            className="p-0.5 rounded text-ivory-ghost hover:text-gold transition-colors"
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {searchQuery.trim() && (
        <div className="border-b border-ink-border overflow-y-auto max-h-40">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ivory-ghost">No results</p>
          ) : (
            filtered.map((e) => {
              const et = entityTypes.find((t) => t.id === e.entity_type_id);
              return (
                <button
                  key={e.id}
                  onClick={() => { setSelectedEntityId(e.id); setSearchQuery(""); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-ink-muted transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: et?.color ?? "#c9a84c" }}
                  />
                  <span className="truncate text-ivory">{e.name}</span>
                  <span className="text-ivory-ghost ml-auto">{et?.name ?? ""}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {entity ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {entityType && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entityType.color ?? "#c9a84c" }}
                />
              )}
              <div>
                <p className="text-sm font-medium text-ivory">{entity.name}</p>
                {entityType && <p className="text-xs text-ivory-ghost">{entityType.name}</p>}
              </div>
            </div>
            {entity.summary && (
              <p className="text-xs text-ivory-dim leading-relaxed">{entity.summary}</p>
            )}
            {fieldDefs.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-ink-border">
                {fieldDefs.map((fd) => {
                  if (fd.field_type === "image") {
                    const asset = assets.find((a) => a.label === fd.id);
                    if (!asset) return null;
                    return (
                      <div key={fd.id} className="space-y-1">
                        <span className="text-xs text-ivory-ghost">{fd.label}</span>
                        <AssetThumb asset={asset} label={fd.label} />
                      </div>
                    );
                  }
                  const fv = fieldValues.get(fd.id);
                  if (!fv) return null;
                  const val = getTextValue(fv);
                  if (!val) return null;
                  const unit = getNumberUnit(fd);
                  return (
                    <div key={fd.id} className="flex gap-2 text-xs">
                      <span className="text-ivory-ghost w-24 flex-shrink-0 truncate">{fd.label}</span>
                      <span className="text-ivory-dim truncate">{val}{unit && <span className="text-ivory-ghost ml-0.5">{unit}</span>}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {relationRows.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-ink-border">
                {relationRows.map(({ relation, roleLabel, otherEntityId }) => {
                  const other = allEntities.find((e) => e.id === otherEntityId);
                  return (
                    <div key={relation.id} className="flex gap-2 text-xs">
                      <span className="text-ivory-ghost w-24 flex-shrink-0 truncate">{roleLabel}</span>
                      <button
                        onClick={() => setSelectedEntityId(otherEntityId)}
                        className="text-ivory-dim truncate hover:text-gold transition-colors text-left"
                      >
                        {other?.name ?? "Unknown entity"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-ivory-ghost text-center mt-4">
            {allEntities.length === 0
              ? "No entities yet. Create one in the World tab."
              : "Select an entity or search above."}
          </p>
        )}
      </div>
    </div>
  );
}

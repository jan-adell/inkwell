import { useState, useEffect } from "react";
import { Search, ExternalLink } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { invokeGetFieldValues, invokeListFieldDefinitions } from "../hooks/useTauri";
import type { Entity, EntityType, FieldDefinition, FieldValue } from "../types/core";

function getTextValue(fv: FieldValue): string {
  if (fv.value_text !== null) return fv.value_text;
  if (fv.value_date !== null) return fv.value_date;
  if (fv.value_number !== null) return String(fv.value_number);
  if (fv.value_boolean !== null) return fv.value_boolean ? "true" : "false";
  return "";
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
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [fieldValues, setFieldValues] = useState<Map<string, FieldValue>>(new Map());
  const [allEntities, setAllEntities] = useState<Entity[]>([]);

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
                {fieldDefs
                  .filter((fd) => fd.field_type !== "image")
                  .map((fd) => {
                    const fv = fieldValues.get(fd.id);
                    if (!fv) return null;
                    const val = getTextValue(fv);
                    if (!val) return null;
                    return (
                      <div key={fd.id} className="flex gap-2 text-xs">
                        <span className="text-ivory-ghost w-24 flex-shrink-0 truncate">{fd.label}</span>
                        <span className="text-ivory-dim truncate">{val}</span>
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

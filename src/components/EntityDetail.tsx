import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeGetFieldValues,
  invokeListFieldDefinitions,
  invokeCreateFieldDefinition,
  invokeDeleteFieldDefinition,
  invokeSetFieldValue,
  invokeUpdateEntity,
} from "../hooks/useTauri";
import type { Entity, EntityType, FieldDefinition, FieldValue, FieldType } from "../types/core";

const ADDABLE_FIELD_TYPES: { label: string; type: FieldType }[] = [
  { label: "Short text", type: "text" },
  { label: "Long text", type: "textarea" },
  { label: "Date", type: "date" },
  { label: "Image", type: "image" },
  { label: "Entity", type: "entity_ref" },
  { label: "Entity List", type: "multiselect" },
];

function parseEntityTypeIdFromOptions(options: string | null | undefined): string | null {
  if (!options) return null;

  try {
    const parsed = JSON.parse(options);
    if (typeof parsed === "string") return parsed || null;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.entityTypeId === "string") return parsed.entityTypeId;
      if (typeof parsed.entity_type_id === "string") return parsed.entity_type_id;
    }
  } catch {
    // ignore invalid JSON metadata and treat as unset
  }

  return null;
}

function encodeEntityTypeOptions(entityTypeId: string): string {
  return JSON.stringify({ entityTypeId });
}

function getTextValue(fv: FieldValue): string {
  if (fv.value_text !== null) return fv.value_text;
  if (fv.value_date !== null) return fv.value_date;
  if (fv.value_number !== null) return String(fv.value_number);
  if (fv.value_boolean !== null) return fv.value_boolean ? "true" : "false";
  if (fv.value_json !== null) return fv.value_json;
  return "";
}

function fieldValuePayload(fieldType: FieldType, raw: string): { type: string; value: unknown } {
  switch (fieldType) {
    case "number": return { type: "Number", value: parseFloat(raw) || 0 };
    case "boolean": return { type: "Boolean", value: raw === "true" };
    case "date": return { type: "Date", value: raw };
    case "multiselect": return { type: "Json", value: raw || "[]" };
    case "entity_ref": return { type: "Text", value: raw };
    default: return { type: "Text", value: raw };
  }
}

function PropertyRow({
  fieldDef,
  fieldValue,
  entity,
  onDeleted,
  onSaved,
}: {
  fieldDef: FieldDefinition;
  fieldValue: FieldValue | undefined;
  entity: Entity;
  onDeleted: (id: string) => void;
  onSaved: (fv: FieldValue) => void;
}) {
  const { entityTypes } = useAppStore();
  const [draft, setDraft] = useState(fieldValue ? getTextValue(fieldValue) : "");

  const entityTypeId = parseEntityTypeIdFromOptions(fieldDef.options);
  const configuredEntityType = entityTypeId
    ? entityTypes.find((type) => type.id === entityTypeId)
    : undefined;
  const entityOptions = configuredEntityType
    ? (useAppStore.getState().entitiesByType[configuredEntityType.id] ?? [])
    : [];

  useEffect(() => {
    setDraft(fieldValue ? getTextValue(fieldValue) : "");
  }, [fieldValue]);

  async function save(nextValue: string) {
    try {
      const saved = await invokeSetFieldValue({
        entity_id: entity.id,
        field_def_id: fieldDef.id,
        value: fieldValuePayload(fieldDef.field_type, nextValue),
      });
      onSaved(saved);
      setDraft(nextValue);
    } catch {
      // ignore
    }
  }

  async function handleDelete() {
    try {
      await invokeDeleteFieldDefinition(fieldDef.id);
      onDeleted(fieldDef.id);
    } catch {
      // ignore
    }
  }

  function renderEntitySelect() {
    if (!configuredEntityType) {
      return <span className="text-xs text-ivory-ghost italic">Missing entity type</span>;
    }

    const selectedValue = fieldValue?.value_text ?? "";

    return (
      <select
        value={selectedValue}
        onChange={(e) => {
          const nextValue = e.target.value;
          void save(nextValue);
        }}
        className="w-full bg-transparent text-ivory text-sm focus:outline-none"
      >
        <option value="">Select {configuredEntityType.name}</option>
        {entityOptions.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
    );
  }

  function renderEntityListSelect() {
    if (!configuredEntityType) {
      return <span className="text-xs text-ivory-ghost italic">Missing entity type</span>;
    }

    let selectedIds: string[] = [];
    if (fieldValue?.value_json) {
      try {
        const parsed = JSON.parse(fieldValue.value_json) as unknown;
        if (Array.isArray(parsed)) {
          selectedIds = parsed.filter((item): item is string => typeof item === "string");
        }
      } catch {
        // ignore malformed data
      }
    }

    return (
      <select
        multiple
        value={selectedIds}
        onChange={(e) => {
          const nextIds = Array.from(e.target.selectedOptions, (option) => option.value);
          void save(JSON.stringify(nextIds));
        }}
        className="w-full bg-transparent text-ivory text-sm focus:outline-none min-h-[84px]"
      >
        {entityOptions.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="group grid grid-cols-[140px_1fr_auto] gap-2 items-start py-1.5 border-b border-ink-border/30">
      <span className="text-xs text-ivory-ghost pt-1.5 truncate">{fieldDef.label}</span>
      <div className="min-w-0">
        {fieldDef.field_type === "image" ? (
          <button
            type="button"
            className="text-xs text-ivory-ghost border border-ink-border rounded px-2 py-1 hover:text-ivory hover:border-ink-muted"
          >
            Add image
          </button>
        ) : fieldDef.field_type === "textarea" ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save(draft)}
            rows={3}
            className="w-full bg-transparent text-ivory text-sm focus:outline-none resize-none"
          />
        ) : fieldDef.field_type === "entity_ref" ? (
          renderEntitySelect()
        ) : fieldDef.field_type === "multiselect" ? (
          renderEntityListSelect()
        ) : (
          <input
            type={fieldDef.field_type === "date" ? "date" : "text"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save(draft)}
            className="w-full bg-transparent text-ivory text-sm focus:outline-none"
          />
        )}
      </div>
      <button
        onClick={() => void handleDelete()}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all mt-1"
        title="Remove property"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function AddPropertyForm({
  entity,
  onAdded,
}: {
  entity: Entity;
  onAdded: (fd: FieldDefinition) => void;
}) {
  const { entityTypes } = useAppStore();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType | null>(null);
  const [entityTypeId, setEntityTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function resetForm() {
    setLabel("");
    setFieldType(null);
    setEntityTypeId("");
    setError(null);
    setOpen(false);
  }

  async function submit() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Please enter a property label.");
      return;
    }

    if (!fieldType) {
      setError("Please select a property type.");
      return;
    }

    if ((fieldType === "entity_ref" || fieldType === "multiselect") && !entityTypeId) {
      setError("Please select an entity type.");
      return;
    }

    try {
      const payload: {
        entity_type_id: string;
        name: string;
        label: string;
        field_type: string;
        options?: string;
      } = {
        entity_type_id: entity.entity_type_id,
        name: trimmed.toLowerCase().replace(/\s+/g, "_"),
        label: trimmed,
        field_type: fieldType,
      };

      if (fieldType === "entity_ref" || fieldType === "multiselect") {
        payload.options = encodeEntityTypeOptions(entityTypeId);
      }

      const fd = await invokeCreateFieldDefinition(payload);
      onAdded(fd);
      resetForm();
    } catch {
      setError("Unable to create property.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 mt-3 text-xs text-ivory-ghost hover:text-ivory transition-colors"
      >
        <Plus size={12} />
        Add property
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        ref={inputRef}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") resetForm();
        }}
        placeholder="Property label…"
        className="w-full bg-ink-muted text-ivory text-sm px-2 py-1 rounded focus:outline-none"
      />

      {error && <p className="text-[10px] text-crimson">{error}</p>}

      <div className="flex gap-2 flex-wrap">
        {ADDABLE_FIELD_TYPES.map((opt) => (
          <button
            key={opt.type}
            type="button"
            onClick={() => {
              setFieldType(opt.type);
              setError(null);
            }}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${fieldType === opt.type ? "bg-gold/30 text-gold" : "bg-ink-muted text-ivory-ghost hover:text-ivory"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {(fieldType === "entity_ref" || fieldType === "multiselect") && (
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-ivory-ghost">
            Entity type
          </label>
          <select
            value={entityTypeId}
            onChange={(e) => {
              setEntityTypeId(e.target.value);
              setError(null);
            }}
            className="w-full bg-ink-muted text-ivory text-xs px-2 py-1 rounded focus:outline-none"
          >
            <option value="">Select entity type…</option>
            {entityTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          className="flex-1 text-xs bg-gold/20 text-gold rounded py-0.5 hover:bg-gold/30"
        >
          Add
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="flex-1 text-xs text-ivory-ghost rounded py-0.5 hover:bg-ink-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function findEntityInStore(entityId: string): Entity | undefined {
  const state = useAppStore.getState();
  const all = [
    ...state.rootEntities,
    ...Object.values(state.entitiesByFolder).flat(),
  ];
  return all.find((e) => e.id === entityId);
}

function updateEntityInStore(updated: Entity) {
  const state = useAppStore.getState();
  if (state.rootEntities.some((e) => e.id === updated.id)) {
    state.setRootEntities(state.rootEntities.map((e) => (e.id === updated.id ? updated : e)));
    return;
  }
  for (const [folderId, entities] of Object.entries(state.entitiesByFolder)) {
    if (entities.some((e) => e.id === updated.id)) {
      state.setEntitiesForFolder(folderId, entities.map((e) => (e.id === updated.id ? updated : e)));
      return;
    }
  }
}

export function EntityDetail({ entityId }: { entityId: string }) {
  const { entityTypes, fieldDefinitionsByType, setFieldDefinitionsForType } = useAppStore();
  const [entity, setEntity] = useState<Entity | null>(() => findEntityInStore(entityId) ?? null);
  const [fieldValues, setFieldValues] = useState<Map<string, FieldValue>>(new Map());
  const [nameDraft, setNameDraft] = useState(entity?.name ?? "");
  const [summaryDraft, setSummaryDraft] = useState(entity?.summary ?? "");

  const entityType: EntityType | undefined = entity
    ? entityTypes.find((t) => t.id === entity.entity_type_id)
    : undefined;

  const fieldDefs: FieldDefinition[] = entity
    ? (fieldDefinitionsByType[entity.entity_type_id] ?? [])
    : [];

  useEffect(() => {
    const found = findEntityInStore(entityId);
    if (found) {
      setEntity(found);
      setNameDraft(found.name);
      setSummaryDraft(found.summary ?? "");
    }
  }, [entityId]);

  useEffect(() => {
    if (!entity) return;
    const typeId = entity.entity_type_id;
    if (fieldDefinitionsByType[typeId]) return;
    invokeListFieldDefinitions(typeId)
      .then((defs) => setFieldDefinitionsForType(typeId, defs))
      .catch(console.error);
  }, [entity?.entity_type_id]);

  useEffect(() => {
    invokeGetFieldValues(entityId)
      .then((fvs) => {
        const m = new Map<string, FieldValue>();
        fvs.forEach((fv) => m.set(fv.field_def_id, fv));
        setFieldValues(m);
      })
      .catch(console.error);
  }, [entityId]);

  async function saveName() {
    if (!entity || nameDraft === entity.name) return;
    try {
      const updated = await invokeUpdateEntity(entity.id, { name: nameDraft });
      setEntity(updated);
      updateEntityInStore(updated);
    } catch {
      setNameDraft(entity.name);
    }
  }

  async function saveSummary() {
    if (!entity) return;
    try {
      const updated = await invokeUpdateEntity(entity.id, { summary: summaryDraft });
      setEntity(updated);
      updateEntityInStore(updated);
    } catch {
      // ignore
    }
  }

  if (!entity) {
    return (
      <div className="flex-1 flex items-center justify-center text-ivory-ghost text-sm">
        Select an entity to view details
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
      <div className="max-w-2xl mx-auto">
        {entityType && (
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entityType.color ?? "#c9a84c" }}
            />
            <span className="text-xs text-ivory-ghost">{entityType.name}</span>
          </div>
        )}

        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => void saveName()}
          className="w-full text-2xl font-semibold text-ivory bg-transparent focus:outline-none mb-1"
        />

        <div className="border-t border-ink-border my-4" />

        <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-2">Description</p>
        <textarea
          value={summaryDraft}
          onChange={(e) => setSummaryDraft(e.target.value)}
          onBlur={() => void saveSummary()}
          rows={4}
          placeholder="Write a description…"
          className="w-full bg-transparent text-ivory-dim text-sm focus:outline-none resize-none"
        />

        {fieldDefs.length > 0 && (
          <>
            <div className="border-t border-ink-border my-4" />
            <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-2">Properties</p>
            {fieldDefs.map((fd) => (
              <PropertyRow
                key={fd.id}
                fieldDef={fd}
                fieldValue={fieldValues.get(fd.id)}
                entity={entity}
                onDeleted={(id) => {
                  const current = fieldDefinitionsByType[entity.entity_type_id] ?? [];
                  setFieldDefinitionsForType(entity.entity_type_id, current.filter((f) => f.id !== id));
                }}
                onSaved={(fv) => {
                  setFieldValues((prev) => new Map(prev).set(fv.field_def_id, fv));
                }}
              />
            ))}
          </>
        )}

        <AddPropertyForm
          entity={entity}
          onAdded={(fd) => {
            const current = fieldDefinitionsByType[entity.entity_type_id] ?? [];
            setFieldDefinitionsForType(entity.entity_type_id, [...current, fd]);
          }}
        />
      </div>
    </div>
  );
}

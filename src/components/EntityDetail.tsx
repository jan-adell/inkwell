import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../store/appStore";
import {
  invokeGetFieldValues,
  invokeListFieldDefinitions,
  invokeCreateFieldDefinition,
  invokeDeleteFieldDefinition,
  invokeSetFieldValue,
  invokeUpdateEntity,
  invokeAddEntityAsset,
  invokeDeleteEntityAsset,
  invokeListEntityAssets,
} from "../hooks/useTauri";
import type { Entity, EntityAsset, EntityType, FieldDefinition, FieldValue, FieldType } from "../types/core";

const ADDABLE_FIELD_TYPES: { label: string; type: FieldType }[] = [
  { label: "Short text", type: "text" },
  { label: "Long text", type: "textarea" },
  { label: "Number", type: "number" },
  { label: "Date", type: "date" },
  { label: "Image", type: "image" },
];

const SI_UNIT_GROUPS: { group: string; units: { symbol: string; name: string }[] }[] = [
  { group: "Length", units: [{ symbol: "mm", name: "Millimetre" }, { symbol: "cm", name: "Centimetre" }, { symbol: "m", name: "Metre" }, { symbol: "km", name: "Kilometre" }] },
  { group: "Mass", units: [{ symbol: "mg", name: "Milligram" }, { symbol: "g", name: "Gram" }, { symbol: "kg", name: "Kilogram" }, { symbol: "t", name: "Tonne" }] },
  { group: "Time", units: [{ symbol: "ms", name: "Millisecond" }, { symbol: "s", name: "Second" }, { symbol: "min", name: "Minute" }, { symbol: "h", name: "Hour" }, { symbol: "d", name: "Day" }] },
  { group: "Temperature", units: [{ symbol: "°C", name: "Celsius" }, { symbol: "K", name: "Kelvin" }] },
  { group: "Area", units: [{ symbol: "cm²", name: "Square centimetre" }, { symbol: "m²", name: "Square metre" }, { symbol: "km²", name: "Square kilometre" }, { symbol: "ha", name: "Hectare" }] },
  { group: "Volume", units: [{ symbol: "mL", name: "Millilitre" }, { symbol: "L", name: "Litre" }, { symbol: "m³", name: "Cubic metre" }] },
  { group: "Speed", units: [{ symbol: "m/s", name: "Metres per second" }, { symbol: "km/h", name: "Kilometres per hour" }] },
  { group: "Force", units: [{ symbol: "N", name: "Newton" }, { symbol: "kN", name: "Kilonewton" }] },
  { group: "Energy", units: [{ symbol: "J", name: "Joule" }, { symbol: "kJ", name: "Kilojoule" }, { symbol: "kWh", name: "Kilowatt-hour" }, { symbol: "kcal", name: "Kilocalorie" }] },
  { group: "Power", units: [{ symbol: "W", name: "Watt" }, { symbol: "kW", name: "Kilowatt" }, { symbol: "MW", name: "Megawatt" }] },
  { group: "Pressure", units: [{ symbol: "Pa", name: "Pascal" }, { symbol: "kPa", name: "Kilopascal" }, { symbol: "bar", name: "Bar" }] },
  { group: "Frequency", units: [{ symbol: "Hz", name: "Hertz" }, { symbol: "kHz", name: "Kilohertz" }, { symbol: "MHz", name: "Megahertz" }] },
  { group: "Electric", units: [{ symbol: "A", name: "Ampere" }, { symbol: "V", name: "Volt" }, { symbol: "Ω", name: "Ohm" }, { symbol: "W", name: "Watt" }] },
  { group: "Data", units: [{ symbol: "B", name: "Byte" }, { symbol: "KB", name: "Kilobyte" }, { symbol: "MB", name: "Megabyte" }, { symbol: "GB", name: "Gigabyte" }, { symbol: "TB", name: "Terabyte" }] },
];

function getNumberUnit(fieldDef: FieldDefinition): string {
  if (fieldDef.field_type !== "number" || !fieldDef.options) return "";
  try {
    const parsed = JSON.parse(fieldDef.options) as { unit?: string };
    return parsed.unit ?? "";
  } catch {
    return "";
  }
}

function getTextValue(fv: FieldValue): string {
  if (fv.value_text !== null) return fv.value_text;
  if (fv.value_date !== null) return fv.value_date;
  if (fv.value_number !== null) return String(fv.value_number);
  if (fv.value_boolean !== null) return fv.value_boolean ? "true" : "false";
  return "";
}

function fieldValuePayload(fieldType: FieldType, raw: string): { type: string; value: unknown } {
  switch (fieldType) {
    case "number": return { type: "Number", value: parseFloat(raw) || 0 };
    case "boolean": return { type: "Boolean", value: raw === "true" };
    case "date": return { type: "Date", value: raw };
    default: return { type: "Text", value: raw };
  }
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "svg"];

function ImageField({
  entity,
  fieldDef,
  asset,
  projectPath,
  onAssetChanged,
}: {
  entity: Entity;
  fieldDef: FieldDefinition;
  asset: EntityAsset | undefined;
  projectPath: string;
  onAssetChanged: () => void;
}) {
  const imageUrl = asset && projectPath
    ? convertFileSrc(`${projectPath}/${asset.relative_path}`)
    : null;

  async function pick() {
    const selected = await open({ multiple: false, filters: [{ name: "Image", extensions: IMAGE_EXTENSIONS }] });
    if (typeof selected !== "string") return;
    if (asset) await invokeDeleteEntityAsset(asset.id);
    await invokeAddEntityAsset(entity.id, selected, fieldDef.id);
    onAssetChanged();
  }

  async function remove() {
    if (!asset) return;
    await invokeDeleteEntityAsset(asset.id);
    onAssetChanged();
  }

  if (imageUrl) {
    return (
      <div className="relative group/img w-fit">
        <img src={imageUrl} alt={fieldDef.label} className="h-24 object-cover rounded" />
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
          <button
            onClick={() => void pick()}
            title="Replace image"
            className="p-0.5 rounded bg-ink-deep/80 text-ivory-ghost hover:text-ivory transition-colors"
          >
            <Upload size={10} />
          </button>
          <button
            onClick={() => void remove()}
            title="Remove image"
            className="p-0.5 rounded bg-ink-deep/80 text-ivory-ghost hover:text-crimson transition-colors"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => void pick()}
      className="text-xs text-ivory-ghost hover:text-ivory transition-colors"
    >
      Choose image…
    </button>
  );
}

export function PropertyRow({
  fieldDef,
  fieldValue,
  entity,
  asset,
  projectPath,
  onDeleted,
  onSaved,
  onAssetChanged,
}: {
  fieldDef: FieldDefinition;
  fieldValue: FieldValue | undefined;
  entity: Entity;
  asset?: EntityAsset;
  projectPath: string;
  onDeleted: (id: string) => void;
  onSaved: (fv: FieldValue) => void;
  onAssetChanged: () => void;
}) {
  const [draft, setDraft] = useState(fieldValue ? getTextValue(fieldValue) : "");
  const unit = getNumberUnit(fieldDef);

  useEffect(() => {
    setDraft(fieldValue ? getTextValue(fieldValue) : "");
  }, [fieldValue]);

  async function save() {
    try {
      const saved = await invokeSetFieldValue({
        entity_id: entity.id,
        field_def_id: fieldDef.id,
        value: fieldValuePayload(fieldDef.field_type, draft),
      });
      onSaved(saved);
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

  return (
    <div className="group grid grid-cols-[140px_1fr_auto] gap-2 items-start py-1.5 border-b border-ink-border/30">
      <span className="text-xs text-ivory-ghost pt-1.5 truncate">{fieldDef.label}</span>
      <div className="min-w-0">
        {fieldDef.field_type === "image" ? (
          <ImageField
            entity={entity}
            fieldDef={fieldDef}
            asset={asset}
            projectPath={projectPath}
            onAssetChanged={onAssetChanged}
          />
        ) : fieldDef.field_type === "textarea" ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            rows={3}
            className="w-full bg-transparent text-ivory text-sm focus:outline-none resize-none"
          />
        ) : (
          <div className="flex items-baseline gap-1 min-w-0">
            <input
              type={fieldDef.field_type === "date" ? "date" : "text"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void save()}
              className={`bg-transparent text-ivory text-sm focus:outline-none ${unit ? "w-20" : "min-w-0 w-full"}`}
            />
            {unit && <span className="text-xs text-ivory-ghost">{unit}</span>}
          </div>
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
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [unit, setUnit] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  async function submit() {
    const trimmed = label.trim();
    if (!trimmed) { setOpen(false); return; }
    const options = fieldType === "number" && unit ? JSON.stringify({ unit }) : undefined;
    try {
      const fd = await invokeCreateFieldDefinition({
        entity_type_id: entity.entity_type_id,
        name: trimmed.toLowerCase().replace(/\s+/g, "_"),
        label: trimmed,
        field_type: fieldType,
        options,
      });
      onAdded(fd);
    } catch {
      // ignore
    }
    setLabel("");
    setOpen(false);
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
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Property label…"
        className="w-full bg-ink-muted text-ivory text-sm px-2 py-1 rounded focus:outline-none"
      />
      <div className="flex gap-2 flex-wrap">
        {ADDABLE_FIELD_TYPES.map((opt) => (
          <button
            key={opt.type}
            onClick={() => { setFieldType(opt.type); if (opt.type !== "number") setUnit(""); }}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${fieldType === opt.type ? "bg-gold/30 text-gold" : "bg-ink-muted text-ivory-ghost hover:text-ivory"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {fieldType === "number" && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ivory-ghost">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="bg-ink-muted text-ivory text-xs px-1.5 py-0.5 rounded focus:outline-none"
          >
            <option value="">— none</option>
            {SI_UNIT_GROUPS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.units.map((u) => (
                  <option key={`${group.group}-${u.symbol}`} value={u.symbol}>
                    {u.symbol} — {u.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => void submit()} className="flex-1 text-xs bg-gold/20 text-gold rounded py-0.5 hover:bg-gold/30">Add</button>
        <button onClick={() => setOpen(false)} className="flex-1 text-xs text-ivory-ghost rounded py-0.5 hover:bg-ink-muted">Cancel</button>
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
  const { entityTypes, fieldDefinitionsByType, setFieldDefinitionsForType, projectPath } = useAppStore();
  const [entity, setEntity] = useState<Entity | null>(() => findEntityInStore(entityId) ?? null);
  const [fieldValues, setFieldValues] = useState<Map<string, FieldValue>>(new Map());
  const [assets, setAssets] = useState<EntityAsset[]>([]);
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

  function loadAssets() {
    invokeListEntityAssets(entityId).then(setAssets).catch(() => {});
  }

  useEffect(() => {
    loadAssets();
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
                asset={assets.find((a) => a.label === fd.id)}
                projectPath={projectPath ?? ""}
                onDeleted={(id) => {
                  const current = fieldDefinitionsByType[entity.entity_type_id] ?? [];
                  setFieldDefinitionsForType(entity.entity_type_id, current.filter((f) => f.id !== id));
                }}
                onSaved={(fv) => {
                  setFieldValues((prev) => new Map(prev).set(fv.field_def_id, fv));
                }}
                onAssetChanged={loadAssets}
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

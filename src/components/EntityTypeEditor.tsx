import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeCreateEntityTemplate,
  invokeUpdateEntityTemplate,
  invokeDeleteEntityTemplate,
} from "../hooks/useTauri";
import type { DefaultField, EntityTemplate, FieldType } from "../types/core";
import { ConfirmDialog } from "./ConfirmDialog";

const FIELD_TYPES: { label: string; type: FieldType }[] = [
  { label: "Short text", type: "text" },
  { label: "Long text", type: "textarea" },
  { label: "Number", type: "number" },
  { label: "Date", type: "date" },
  { label: "Select", type: "select" },
  { label: "Yes/No", type: "boolean" },
];

const FIELD_TYPE_COLORS: Record<FieldType, string> = {
  text: "#4A9FD4",
  textarea: "#4EA86B",
  number: "#E8883A",
  date: "#D4A24A",
  select: "#8B6FE8",
  boolean: "#D44A7A",
  multiselect: "#6B7280",
  entity_ref: "#6B7280",
  image: "#6B7280",
  url: "#6B7280",
  color: "#6B7280",
};

function fieldsError(fields: DefaultField[]): string | null {
  if (fields.some((f) => !f.label.trim() || !f.name.trim())) {
    return "Every property needs a name.";
  }
  const names = fields.map((f) => f.name);
  const duplicate = names.find((n, i) => names.indexOf(n) !== i);
  return duplicate ? `Two properties share the name "${duplicate}".` : null;
}

function formatSelectOptions(options: string | null): string {
  if (!options) return "";
  try {
    const parsed = JSON.parse(options) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").join(", ")
      : "";
  } catch {
    return "";
  }
}

function serializeSelectOptions(text: string): string | null {
  const choices = text.split(",").map((c) => c.trim()).filter(Boolean);
  return choices.length > 0 ? JSON.stringify(choices) : null;
}

function SelectOptionsInput({
  options,
  onChange,
}: {
  options: string | null;
  onChange: (options: string | null) => void;
}) {
  const [draft, setDraft] = useState(() => formatSelectOptions(options));
  const value = serializeSelectOptions(draft) === options ? draft : formatSelectOptions(options);

  return (
    <input
      value={value}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(serializeSelectOptions(e.target.value));
      }}
      placeholder="Option A, Option B, Option C"
      aria-label="Select options"
      className="w-full bg-ink-muted text-ivory text-xs px-2 py-1 rounded focus:outline-none"
    />
  );
}

function applyFieldPatch(field: DefaultField, patch: Partial<DefaultField>): DefaultField {
  const typeChanged = patch.field_type !== undefined && patch.field_type !== field.field_type;
  return { ...field, ...(typeChanged ? { options: null } : {}), ...patch };
}

function emptyField(): DefaultField {
  return { name: "", label: "", field_type: "text", options: null, default_value: null };
}

function TemplateForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: EntityTemplate | null;
  onCancel: () => void;
  onSaved: (t: EntityTemplate) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [namePlural, setNamePlural] = useState(initial?.name_plural ?? "");
  const [color, setColor] = useState(initial?.color ?? "#8B6FE8");
  const [fields, setFields] = useState<DefaultField[]>(initial?.fields ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateField(index: number, patch: Partial<DefaultField>) {
    setFields(fields.map((f, i) => (i === index ? applyFieldPatch(f, patch) : f)));
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a name.");
      return;
    }
    const invalidFields = fieldsError(fields);
    if (invalidFields) {
      setError(invalidFields);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: trimmed,
        name_plural: namePlural.trim() || `${trimmed}s`,
        color,
        fields,
      };
      const saved = initial
        ? await invokeUpdateEntityTemplate(initial.id, payload)
        : await invokeCreateEntityTemplate(payload);
      onSaved(saved);
    } catch {
      setError("Unable to save entity type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 p-4 bg-ink-surface border border-ink-border rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display text-gold">
          {initial ? "Edit Entity Type" : "New Entity Type"}
        </h3>
        <button onClick={onCancel} className="p-1 text-ivory-ghost hover:text-ivory" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full bg-ink-muted text-ivory text-sm px-2 py-1 rounded focus:outline-none"
      />
      <input
        value={namePlural}
        onChange={(e) => setNamePlural(e.target.value)}
        placeholder="Plural (optional)"
        className="w-full bg-ink-muted text-ivory text-sm px-2 py-1 rounded focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <label htmlFor="template-color" className="text-xs text-ivory-ghost">Color</label>
        <input
          id="template-color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-10 bg-transparent border border-ink-border rounded cursor-pointer"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-ivory-ghost uppercase tracking-wider">Default Properties</p>
          <button
            onClick={() => setFields([...fields, emptyField()])}
            className="flex items-center gap-1 text-xs bg-gold/20 text-gold rounded px-2 py-1 hover:bg-gold/30 transition-colors"
          >
            <Plus size={12} />
            Add Field
          </button>
        </div>

        {fields.length === 0 && (
          <p className="text-xs text-ivory-ghost italic px-1">No default properties yet.</p>
        )}

        {fields.map((field, i) => (
          <div
            key={i}
            className="space-y-1.5 px-3 py-2 rounded border border-ink-border bg-ink-surface"
          >
            <div className="flex items-center gap-2">
              <span className="w-20 flex-shrink-0 text-[11px] font-mono text-ivory-ghost truncate">
                {field.name || "—"}
              </span>
              <input
                value={field.label}
                onChange={(e) =>
                  updateField(i, {
                    label: e.target.value,
                    name: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                  })
                }
                placeholder="Property label"
                className="flex-1 min-w-0 bg-transparent text-ivory text-sm font-medium px-1 py-1 focus:outline-none"
              />
              <select
                value={field.field_type}
                onChange={(e) => updateField(i, { field_type: e.target.value as FieldType })}
                className="text-[11px] font-mono uppercase tracking-wider rounded-full px-2.5 py-1 border-none focus:outline-none cursor-pointer flex-shrink-0"
                style={{
                  color: FIELD_TYPE_COLORS[field.field_type],
                  backgroundColor: `${FIELD_TYPE_COLORS[field.field_type]}22`,
                }}
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.type} value={ft.type}>{ft.label}</option>
                ))}
              </select>
              <button
                onClick={() => removeField(i)}
                className="p-1 text-ivory-ghost hover:text-crimson flex-shrink-0"
                aria-label={`Remove property ${field.label || i + 1}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
            {field.field_type === "select" && (
              <SelectOptionsInput
                options={field.options}
                onChange={(options) => updateField(i, { options })}
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-[10px] text-crimson">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => void submit()}
          disabled={saving}
          className="flex-1 text-xs bg-gold/20 text-gold rounded py-1.5 hover:bg-gold/30 disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onCancel} className="flex-1 text-xs text-ivory-ghost rounded py-1.5 hover:bg-ink-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EntityTypeEditor() {
  const { entityTemplates, setEntityTemplates } = useAppStore();
  const [editing, setEditing] = useState<EntityTemplate | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EntityTemplate | null>(null);

  function handleSaved(template: EntityTemplate) {
    const exists = entityTemplates.some((t) => t.id === template.id);
    setEntityTemplates(
      exists
        ? entityTemplates.map((t) => (t.id === template.id ? template : t))
        : [...entityTemplates, template]
    );
    setEditing(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await invokeDeleteEntityTemplate(pendingDelete.id);
    setEntityTemplates(entityTemplates.filter((t) => t.id !== pendingDelete.id));
    setPendingDelete(null);
  }

  if (editing) {
    return (
      <TemplateForm
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="space-y-2">
      {entityTemplates.map((template) => (
        <div
          key={template.id}
          className="flex items-center justify-between px-3 py-2 rounded border border-ink-border"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: template.color }} />
            <span className="text-sm text-ivory">{template.name}</span>
            <span className="text-xs text-ivory-ghost">
              ({template.fields.length} {template.fields.length === 1 ? "property" : "properties"})
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(template)}
              className="p-1 text-ivory-ghost hover:text-ivory"
              aria-label={`Edit ${template.name}`}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setPendingDelete(template)}
              className="p-1 text-ivory-ghost hover:text-crimson"
              aria-label={`Delete ${template.name}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={() => setEditing("new")}
        className="flex items-center gap-1.5 mt-2 text-xs text-ivory-ghost hover:text-ivory"
      >
        <Plus size={12} />
        Add entity type
      </button>

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          description="Existing entities of this type in your projects are not affected — only new entities will no longer be creatable from this template."
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

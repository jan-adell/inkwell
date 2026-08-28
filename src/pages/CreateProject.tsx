import { useState } from "react";
import { ArrowLeft, BookOpen, Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invokeCreateProject, invokeImportProject } from "../hooks/useTauri";

interface Props {
  onCancel: () => void;
  onCreated: (projectId: string) => void;
}

export function CreateProject({ onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name cannot be empty.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const result = await invokeCreateProject(trimmed);
      onCreated(result.project_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === "string" ? e : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  async function handleImport() {
    const selected = await open({
      filters: [{ name: "Inkwell Project", extensions: ["inkwell"] }],
    });
    if (!selected) return;

    setError(null);
    setImporting(true);
    try {
      const archivePath = Array.isArray(selected) ? selected[0] : selected;
      const result = await invokeImportProject(archivePath);
      onCreated(result.project_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === "string" ? e : "Failed to import project.");
    } finally {
      setImporting(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="min-h-full flex flex-col bg-ink-gradient select-none">
      {/* Header */}
      <header className="flex items-center gap-4 px-10 py-6 border-b border-ink-border">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-ivory-ghost hover:text-ivory text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <span className="text-ivory-ghost">·</span>
        <span className="text-sm text-ivory-dim">New project</span>
      </header>

      {/* Form */}
      <main className="flex-1 flex items-start justify-center px-6 pt-24">
        <div className="w-full max-w-md">
          {/* Icon */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-xl bg-ink-surface border border-ink-border flex items-center justify-center">
              <BookOpen size={28} className="text-gold opacity-70" />
            </div>
          </div>

          <h2 className="text-2xl font-display text-ivory text-center mb-1 tracking-wide">
            Create a new project
          </h2>
          <p className="text-sm text-ivory-ghost text-center mb-10">
            Give your world a name. You can change it later.
          </p>

          {/* Name input */}
          <label className="block mb-1">
            <span className="text-xs font-mono text-ivory-ghost uppercase tracking-wider">
              Project name
            </span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={handleKey}
            placeholder="e.g. The Chronicles of Aetheria"
            autoFocus
            className="
              w-full px-4 py-3 rounded-lg
              bg-ink-deep border border-ink-border
              text-ivory placeholder:text-ivory-ghost
              text-sm font-body selectable
              focus:outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/30
              transition-colors
            "
          />

          {error && (
            <p className="mt-2 text-xs text-crimson font-mono">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-8">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-ink-border text-ivory-ghost text-sm font-mono hover:border-ivory-ghost/40 hover:text-ivory transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || importing || !name.trim()}
              className="
                flex-1 py-2.5 rounded-lg
                bg-gold text-ink-void text-sm font-mono font-semibold
                hover:bg-gold-bright transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {creating ? "Creating…" : "Create project"}
            </button>
          </div>

          {/* Import divider */}
          <div className="flex items-center gap-3 mt-8">
            <div className="flex-1 h-px bg-ink-border" />
            <span className="text-xs text-ivory-ghost font-mono">or</span>
            <div className="flex-1 h-px bg-ink-border" />
          </div>

          <button
            onClick={handleImport}
            disabled={importing || creating}
            className="
              mt-4 w-full flex items-center justify-center gap-2
              py-2.5 rounded-lg border border-ink-border
              text-ivory-ghost text-sm font-mono
              hover:border-gold/40 hover:text-ivory hover:bg-gold/5
              transition-colors disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            <Upload size={14} />
            {importing ? "Importing…" : "Import existing project"}
          </button>
        </div>
      </main>
    </div>
  );
}

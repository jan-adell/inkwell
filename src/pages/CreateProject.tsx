import { useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";

interface Props {
  onCancel: () => void;
  onCreated: (projectName: string) => void;
}

export function CreateProject({ onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
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
      // Integration point: replace with invokeCreateProject(trimmed) from useTauri.ts
      // when the Tauri command is wired up. For now, mock a short delay.
      await new Promise((r) => setTimeout(r, 300));
      onCreated(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project.");
    } finally {
      setCreating(false);
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

          {/* Input */}
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
              disabled={creating || !name.trim()}
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
        </div>
      </main>
    </div>
  );
}

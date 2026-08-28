import { useState } from "react";
import { BookOpen, Plus, FolderOpen, Clock, Trash2, Download } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store/appStore";
import {
  invokeDeleteProject,
  invokeExportProject,
  invokeListKnownProjects,
} from "../hooks/useTauri";
import type { KnownProject } from "../types/core";

interface Props {
  onOpenProject: (project: KnownProject) => void;
  onNewProject: () => void;
}

export function ProjectLibrary({ onOpenProject, onNewProject }: Props) {
  const { knownProjects, projectId, setKnownProjects, setProjectId, resetProjectState } =
    useAppStore();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleExport(project: KnownProject) {
    const dest = await save({
      defaultPath: `${project.name}.inkwell`,
      filters: [{ name: "Inkwell Project", extensions: ["inkwell"] }],
    });
    if (!dest) return;

    setExportingId(project.project_id);
    setActionError(null);
    try {
      await invokeExportProject(project.project_id, dest);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : typeof e === "string" ? e : "Export failed.",
      );
    } finally {
      setExportingId(null);
    }
  }

  async function handleDelete(project: KnownProject) {
    setDeletingId(project.project_id);
    setActionError(null);
    try {
      await invokeDeleteProject(project.project_id);
      if (project.project_id === projectId) {
        resetProjectState();
        setProjectId(null);
      }
      const updated = await invokeListKnownProjects();
      setKnownProjects(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : typeof e === "string" ? e : "Delete failed.",
      );
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-ink-gradient select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-10 py-6 border-b border-ink-border">
        <div>
          <h1 className="text-2xl font-display text-gold tracking-widest uppercase">Inkwell</h1>
          <p className="text-xs text-ivory-ghost font-mono tracking-widest mt-0.5">
            Write · Build · Imagine
          </p>
        </div>
        <button
          onClick={onNewProject}
          className="flex items-center gap-2 px-4 py-2 rounded bg-gold text-ink-void text-sm font-mono font-semibold hover:bg-gold-bright transition-colors"
        >
          <Plus size={14} />
          New project
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 px-10 py-10 max-w-3xl w-full mx-auto">
        {actionError && (
          <p className="mb-4 text-xs text-crimson font-mono">{actionError}</p>
        )}

        {knownProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookOpen size={48} className="text-ivory-ghost opacity-20 mb-6" />
            <h2 className="text-xl font-display text-ivory-dim mb-2">No projects yet</h2>
            <p className="text-sm text-ivory-ghost mb-8 max-w-xs leading-relaxed">
              Start your first novel, worldbuilding project, or story collection.
            </p>
            <button
              onClick={onNewProject}
              className="flex items-center gap-2 px-6 py-2.5 rounded border border-gold text-gold text-sm font-mono hover:bg-gold/10 transition-colors"
            >
              <Plus size={14} />
              Create your first project
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Clock size={13} className="text-ivory-ghost" />
              <span className="text-xs font-mono text-ivory-ghost uppercase tracking-widest">
                Recent projects
              </span>
            </div>
            <div className="space-y-2">
              {knownProjects.map((project) => (
                <div key={project.project_id} className="flex items-center gap-2 group">
                  {/* Main open button */}
                  <button
                    onClick={() => confirmingId !== project.project_id && onOpenProject(project)}
                    disabled={deletingId === project.project_id || exportingId === project.project_id}
                    className="flex-1 flex items-center gap-4 px-5 py-4 rounded-lg bg-ink-deep border border-ink-border hover:border-gold/40 hover:bg-ink-surface transition-all text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded bg-ink-muted flex items-center justify-center flex-shrink-0 group-hover:bg-gold/10 transition-colors">
                      <FolderOpen
                        size={16}
                        className="text-gold opacity-60 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ivory font-medium truncate">{project.name}</p>
                      <p className="text-xs text-ivory-ghost mt-0.5">
                        Last opened {new Date(project.last_opened_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>

                  {/* Row actions */}
                  {confirmingId === project.project_id ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-ivory-ghost font-mono">Delete?</span>
                      <button
                        onClick={() => handleDelete(project)}
                        disabled={deletingId === project.project_id}
                        className="px-2.5 py-1 rounded text-xs font-mono bg-crimson/20 text-crimson border border-crimson/40 hover:bg-crimson/30 transition-colors disabled:opacity-40"
                      >
                        {deletingId === project.project_id ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="px-2.5 py-1 rounded text-xs font-mono text-ivory-ghost border border-ink-border hover:text-ivory transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => handleExport(project)}
                        disabled={exportingId === project.project_id}
                        title="Export project"
                        className="p-2 rounded text-ivory-ghost hover:text-gold hover:bg-gold/10 transition-colors disabled:opacity-40"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => { setActionError(null); setConfirmingId(project.project_id); }}
                        title="Delete project"
                        className="p-2 rounded text-ivory-ghost hover:text-crimson hover:bg-crimson/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-10 py-4 border-t border-ink-border">
        <p className="text-xs text-ivory-ghost font-mono text-center tracking-widest">
          LOCAL · PRIVATE · YOURS
        </p>
      </footer>
    </div>
  );
}

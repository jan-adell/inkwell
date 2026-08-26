import { useState } from "react";
import { BookOpen, Plus, FolderOpen, Clock } from "lucide-react";

export interface ProjectEntry {
  id: string;
  name: string;
  lastOpened: string; // ISO date string
}

interface Props {
  onOpenProject: (project: ProjectEntry) => void;
  onNewProject: () => void;
}

// Mock data — replaced with real Tauri calls in a future implementation
// Integration point: invokeListProjects() from hooks/useTauri.ts
const MOCK_PROJECTS: ProjectEntry[] = [];

export function ProjectLibrary({ onOpenProject, onNewProject }: Props) {
  const [projects] = useState<ProjectEntry[]>(MOCK_PROJECTS);

  return (
    <div className="min-h-full flex flex-col bg-ink-gradient select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-10 py-6 border-b border-ink-border">
        <div>
          <h1 className="text-2xl font-display text-gold tracking-widest uppercase">
            Inkwell
          </h1>
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
        {projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookOpen size={48} className="text-ivory-ghost opacity-20 mb-6" />
            <h2 className="text-xl font-display text-ivory-dim mb-2">
              No projects yet
            </h2>
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
          /* Project list */
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Clock size={13} className="text-ivory-ghost" />
              <span className="text-xs font-mono text-ivory-ghost uppercase tracking-widest">
                Recent projects
              </span>
            </div>
            <div className="space-y-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => onOpenProject(project)}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-lg bg-ink-deep border border-ink-border hover:border-gold/40 hover:bg-ink-surface transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded bg-ink-muted flex items-center justify-center flex-shrink-0 group-hover:bg-gold/10 transition-colors">
                    <FolderOpen size={16} className="text-gold opacity-60 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ivory font-medium truncate">
                      {project.name}
                    </p>
                    <p className="text-xs text-ivory-ghost mt-0.5">
                      Last opened {new Date(project.lastOpened).toLocaleDateString()}
                    </p>
                  </div>
                </button>
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

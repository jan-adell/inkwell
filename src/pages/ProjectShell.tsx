import { FileText, User, MapPin, Clock, Search, Settings } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { useAppStore } from "../store/appStore";

// ── Inspector (right panel) ──────────────────────────────────────────────────

function Inspector() {
  const selectedDocumentId = useAppStore((s) => s.selectedDocumentId);

  return (
    <aside className="flex flex-col h-full bg-ink-deep border-l border-ink-border w-64 flex-shrink-0">
      <div className="px-4 py-3 border-b border-ink-border">
        <span className="text-xs font-mono tracking-widest uppercase text-ivory-ghost">
          Inspector
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {selectedDocumentId ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-1">Document</p>
              <p className="text-xs font-mono text-ivory-dim break-all">{selectedDocumentId}</p>
            </div>
            <div className="space-y-1">
              {[
                { label: "Status", value: "Draft" },
                { label: "Words", value: "0" },
                { label: "Created", value: "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1 border-b border-ink-border">
                  <span className="text-xs text-ivory-ghost">{label}</span>
                  <span className="text-xs text-ivory-dim">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileText size={24} className="text-ivory-ghost opacity-30 mb-2" />
            <p className="text-xs text-ivory-ghost">Select a document</p>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Main area (centre panel) ─────────────────────────────────────────────────

function MainArea() {
  const { selectedDocumentId, activeView } = useAppStore();

  if (!selectedDocumentId && activeView === "writing") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-ink-void">
        <div className="text-center max-w-sm">
          <h2 className="text-2xl font-display text-gold mb-3 tracking-wide">
            Start writing
          </h2>
          <p className="text-sm text-ivory-ghost leading-relaxed">
            Select a document from the sidebar, or create a new one to begin.
          </p>
        </div>
      </main>
    );
  }

  if (activeView === "worldbuilding") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-ink-void">
        <div className="text-center max-w-sm">
          <h2 className="text-2xl font-display text-gold mb-3 tracking-wide">
            Your world
          </h2>
          <p className="text-sm text-ivory-ghost leading-relaxed">
            Select an entity type from the sidebar to explore your world.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-ink-void overflow-hidden">
      {/* Editor placeholder — TipTap will live here in a future implementation */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full py-12 px-8">
        <div className="mb-8">
          <div className="h-8 w-3/4 bg-ink-surface rounded animate-pulse mb-3" />
          <div className="h-4 w-1/4 bg-ink-muted rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-4 bg-ink-surface rounded animate-pulse"
              style={{ width: `${70 + (i % 3) * 10}%`, opacity: 0.4 + i * 0.05 }}
            />
          ))}
        </div>
        <p className="mt-12 text-xs text-ivory-ghost text-center font-mono">
          Editor coming in the next implementation
        </p>
      </div>
    </main>
  );
}

// ── Topbar ───────────────────────────────────────────────────────────────────

interface TopbarProps {
  onBackToLibrary: () => void;
}

function Topbar({ onBackToLibrary }: TopbarProps) {
  const projectName = useAppStore((s) => s.projectName);

  return (
    <header className="h-10 flex items-center justify-between px-4 bg-ink-deep border-b border-ink-border flex-shrink-0 select-none">
      {/* Left: logo and project name */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBackToLibrary}
          title="Back to library"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="text-sm font-display text-gold tracking-widest uppercase">
            Inkwell
          </span>
        </button>
        {projectName && (
          <>
            <span className="text-ink-border">·</span>
            <span className="text-sm text-ivory-ghost font-mono">
              {projectName}
            </span>
          </>
        )}
      </div>

      {/* Centre: search placeholder */}
      <button className="flex items-center gap-2 px-3 py-1 rounded bg-ink-surface border border-ink-border text-ivory-ghost text-xs hover:border-gold/40 transition-colors">
        <Search size={11} />
        <span className="font-mono">Search…</span>
        <span className="text-ink-muted ml-2 font-mono">⌘K</span>
      </button>

      {/* Right: secondary actions */}
      <div className="flex items-center gap-1">
        {[
          { Icon: User,     title: "Characters" },
          { Icon: MapPin,   title: "Locations" },
          { Icon: Clock,    title: "Timeline" },
          { Icon: Settings, title: "Settings" },
        ].map(({ Icon, title }) => (
          <button
            key={title}
            title={title}
            className="p-1.5 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </header>
  );
}

// ── ProjectShell ─────────────────────────────────────────────────────────────

interface ProjectShellProps {
  onBackToLibrary: () => void;
}

export function ProjectShell({ onBackToLibrary }: ProjectShellProps) {
  return (
    <div className="flex flex-col h-full bg-ink-void">
      <Topbar onBackToLibrary={onBackToLibrary} />
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — fixed width */}
        <div className="w-56 flex-shrink-0">
          <Sidebar />
        </div>

        {/* Centre — grows to fill */}
        <MainArea />

        {/* Right inspector — fixed width */}
        <Inspector />
      </div>
    </div>
  );
}

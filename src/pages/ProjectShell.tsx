import { useEffect, useState } from "react";
import { FileText, Map, Clock, Search, Settings, Folder, BookOpen, Globe } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { CreateEntityModal } from "../components/CreateEntityModal";
import { CreateDocumentModal } from "../components/CreateDocumentModal";
import { DocumentEditor } from "../components/DocumentEditor";
import { EntityDetail } from "../components/EntityDetail";
import { EntityPanel } from "../components/EntityPanel";
import { useAppStore } from "../store/appStore";
import { invokeUpdateDocument } from "../hooks/useTauri";
import type { Document } from "../types/core";

const STATUS_LABELS: Record<Document["status"], string> = {
  idea: "Idea",
  draft: "Draft",
  revision: "Revision",
  final: "Final",
};

const STATUS_COLORS: Record<Document["status"], string> = {
  idea: "text-ivory-ghost",
  draft: "text-gold/80",
  revision: "text-amber-400",
  final: "text-emerald-400",
};

function DocInspectorContent() {
  const { selectedDocumentId, rootDocuments, childrenMap, updateDocument } = useAppStore();
  const document = [...rootDocuments, ...Object.values(childrenMap).flat()]
    .find((item) => item.id === selectedDocumentId);

  async function handleStatusChange(status: Document["status"]) {
    if (!document || status === document.status) return;
    try {
      updateDocument(await invokeUpdateDocument(document.id, { status }));
    } catch {
      // The editor remains usable if the status update fails.
    }
  }

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <FileText size={24} className="text-ivory-ghost opacity-30 mb-2" />
        <p className="text-xs text-ivory-ghost">Select a document</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-1">Document</p>
        <p className="text-sm text-ivory break-words">{document.title}</p>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-center py-2 border-b border-ink-border">
          <span className="text-xs text-ivory-ghost">Status</span>
          <select
            value={document.status}
            onChange={(event) => handleStatusChange(event.target.value as Document["status"])}
            className={`bg-transparent text-xs font-mono focus:outline-none cursor-pointer ${STATUS_COLORS[document.status]}`}
          >
            {(Object.keys(STATUS_LABELS) as Document["status"][]).map((status) => (
              <option key={status} value={status} className="bg-ink-deep text-ivory">
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-ink-border">
          <span className="text-xs text-ivory-ghost">Words</span>
          <span className="text-xs text-ivory-dim">{document.word_count}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-ink-border">
          <span className="text-xs text-ivory-ghost">Created</span>
          <span className="text-xs text-ivory-dim">{new Date(document.created_at).toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-ink-border">
          <span className="text-xs text-ivory-ghost">Modified</span>
          <span className="text-xs text-ivory-dim">{new Date(document.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
      {document.synopsis && (
        <div>
          <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-1">Synopsis</p>
          <p className="text-xs text-ivory-dim leading-relaxed">{document.synopsis}</p>
        </div>
      )}
    </div>
  );
}

function Inspector() {
  const [activeTab, setActiveTab] = useState<"doc" | "entity">("doc");
  const { activeView, selectedEntityId } = useAppStore();

  useEffect(() => {
    if (selectedEntityId) setActiveTab("entity");
  }, [selectedEntityId]);

  if (activeView === "worldbuilding") {
    return (
      <aside className="flex flex-col h-full bg-ink-deep border-l border-ink-border w-64 flex-shrink-0 overflow-hidden min-h-0">
        <EntityPanel />
      </aside>
    );
  }

  return (
    <aside className="flex flex-col h-full bg-ink-deep border-l border-ink-border w-64 flex-shrink-0">
      <div className="flex border-b border-ink-border">
        <button
          onClick={() => setActiveTab("doc")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono tracking-wider uppercase transition-colors ${activeTab === "doc" ? "text-gold border-b-2 border-gold" : "text-ivory-ghost hover:text-ivory-dim"}`}
        >
          <BookOpen size={11} />
          Doc
        </button>
        <button
          onClick={() => setActiveTab("entity")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono tracking-wider uppercase transition-colors ${activeTab === "entity" ? "text-gold border-b-2 border-gold" : "text-ivory-ghost hover:text-ivory-dim"}`}
        >
          <Globe size={11} />
          Entity
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "doc" ? (
          <div className="p-4">
            <DocInspectorContent />
          </div>
        ) : (
          <EntityPanel />
        )}
      </div>
    </aside>
  );
}

function MainArea() {
  const { activeView, selectedDocumentId, selectedEntityId, rootDocuments, childrenMap } = useAppStore();

  if (activeView === "worldbuilding") {
    if (selectedEntityId) {
      return (
        <main className="flex-1 flex flex-col bg-ink-void">
          <EntityDetail key={selectedEntityId} entityId={selectedEntityId} />
        </main>
      );
    }
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-ink-void">
        <Globe size={32} className="text-ivory-ghost opacity-20 mx-auto mb-3" />
        <p className="text-sm text-ivory-ghost">Select an entity to view and edit its details.</p>
      </main>
    );
  }

  const selectedDoc = [...rootDocuments, ...Object.values(childrenMap).flat()]
    .find((document) => document.id === selectedDocumentId);

  if (!selectedDocumentId) {
    return <main className="flex-1 flex flex-col items-center justify-center bg-ink-void"><div className="text-center max-w-sm"><h2 className="text-2xl font-display text-gold mb-3 tracking-wide">Start writing</h2><p className="text-sm text-ivory-ghost leading-relaxed">Select a document from the sidebar, or create a new one to begin.</p></div></main>;
  }
  if (selectedDoc?.node_type === "folder") return <main className="flex-1 flex flex-col items-center justify-center bg-ink-void"><Folder size={32} className="text-ivory-ghost opacity-20 mx-auto mb-3" /><p className="text-sm text-ivory font-display tracking-wide">{selectedDoc.title}</p><p className="text-xs text-ivory-ghost mt-1">Folder</p></main>;
  if (selectedDoc) return <main className="flex-1 flex flex-col bg-ink-void overflow-hidden"><DocumentEditor key={selectedDoc.id} documentId={selectedDoc.id} doc={selectedDoc} /></main>;
  return <main className="flex-1 flex flex-col items-center justify-center bg-ink-void"><FileText size={32} className="text-ivory-ghost opacity-20 mx-auto mb-3" /><p className="text-sm text-ivory-ghost">Select a document to start writing.</p></main>;
}

function Topbar({ onGoToLibrary }: { onGoToLibrary: () => void }) {
  const { projectId, knownProjects } = useAppStore();
  const projectName = knownProjects.find((project) => project.project_id === projectId)?.name;
  return <header className="h-10 flex items-center justify-between px-4 bg-ink-deep border-b border-ink-border flex-shrink-0 select-none"><div className="flex items-center gap-2"><button onClick={onGoToLibrary} title="Back to project library" className="text-sm font-display text-gold tracking-widest uppercase hover:text-gold-bright transition-colors">Inkwell</button>{projectName && <><span className="text-ivory-ghost text-xs">›</span><span className="text-sm text-ivory-dim font-body truncate max-w-48">{projectName}</span></>}</div><button className="flex items-center gap-2 px-3 py-1 rounded bg-ink-surface border border-ink-border text-ivory-ghost text-xs hover:border-gold/40 transition-colors"><Search size={11} /><span className="font-mono">Search…</span><span className="text-ink-muted ml-2 font-mono">⌘K</span></button><div className="flex items-center gap-1">{[{ Icon: Map, title: "Locations" }, { Icon: Clock, title: "Timeline" }, { Icon: Settings, title: "Settings" }].map(({ Icon, title }) => <button key={title} title={title} className="p-1.5 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"><Icon size={14} /></button>)}</div></header>;
}

export function ProjectShell({ onGoToLibrary }: { onGoToLibrary: () => void }) {
  return <div className="flex flex-col h-full bg-ink-void"><Topbar onGoToLibrary={onGoToLibrary} /><div className="flex flex-1 min-h-0"><div className="w-56 flex-shrink-0"><Sidebar /></div><MainArea /><Inspector /></div><CreateEntityModal /><CreateDocumentModal /></div>;
}

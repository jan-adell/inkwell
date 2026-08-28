import { useEffect, useState } from "react";
import {
  BookOpen, FileText, Plus, ChevronRight, ChevronDown,
  Feather, Globe, Layers, Trash2,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeListRootDocuments,
  invokeListChildDocuments,
  invokeCreateDocument,
  invokeDeleteDocument,
  invokeListEntityTypes,
} from "../hooks/useTauri";
import type { Document } from "../types/core";

// ── Node type metadata ──────────────────────────────────────────────────────

const NODE_ICON: Record<string, React.ElementType> = {
  novel: BookOpen,
  part: Layers,
  chapter: FileText,
  scene: Feather,
  note: FileText,
  document: FileText,
  folder: Layers,
};

// ── Document tree node ───────────────────────────────────────────────────────

function DocNode({ doc, depth = 0 }: { doc: Document; depth?: number }) {
  const {
    selectedDocumentId, setSelectedDocumentId,
    childrenMap, setChildren, removeDocument,
  } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const children = childrenMap[doc.id] ?? null;
  const hasChildren = doc.node_type === "novel" || doc.node_type === "part" || doc.node_type === "folder";
  const isSelected = selectedDocumentId === doc.id;
  const Icon = NODE_ICON[doc.node_type] ?? FileText;

  async function toggle() {
    if (!hasChildren) return;
    if (!expanded && children === null) {
      setLoading(true);
      try {
        const kids = await invokeListChildDocuments(doc.id);
        setChildren(doc.id, kids);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((e) => !e);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    await invokeDeleteDocument(doc.id);
    removeDocument(doc.id);
  }

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-sm transition-colors
          ${isSelected
            ? "bg-gold/20 text-gold"
            : "text-ivory-dim hover:bg-ink-muted hover:text-ivory"
          }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => { setSelectedDocumentId(doc.id); toggle(); }}
      >
        {hasChildren ? (
          <span className="w-3 h-3 flex-shrink-0 text-ivory-ghost">
            {loading ? (
              <span className="block w-2 h-2 border border-ivory-ghost rounded-full animate-spin" />
            ) : expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <Icon size={13} className="flex-shrink-0 opacity-60" />
        <span className="flex-1 truncate">{doc.title}</span>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {expanded && children && children.length > 0 && (
        <div>
          {children.map((child) => (
            <DocNode key={child.id} doc={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────

export function Sidebar() {
  const {
    activeView, setActiveView,
    projectId, rootDocuments, setRootDocuments, addDocument,
    entityTypes, setEntityTypes,
    setShowCreateEntityModal,
    setShowCreateDocumentModal,
  } = useAppStore();

  const [creating, setCreating] = useState(false);

  // Load root documents on mount
  useEffect(() => {
    if (!projectId) return;
    invokeListRootDocuments(projectId).then(setRootDocuments).catch(console.error);
    invokeListEntityTypes(projectId).then(setEntityTypes).catch(console.error);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createNovel() {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const doc = await invokeCreateDocument(projectId, {
        node_type: "novel",
        title: "Untitled Novel",
      });
      addDocument(doc);
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="flex flex-col h-full bg-ink-deep border-r border-ink-border select-none">
      {/* View toggle */}
      <div className="flex border-b border-ink-border">
        <button
          onClick={() => setActiveView("writing")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-mono tracking-wider uppercase transition-colors
            ${activeView === "writing"
              ? "text-gold border-b-2 border-gold"
              : "text-ivory-ghost hover:text-ivory-dim"
            }`}
        >
          <Feather size={12} />
          Write
        </button>
        <button
          onClick={() => setActiveView("worldbuilding")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-mono tracking-wider uppercase transition-colors
            ${activeView === "worldbuilding"
              ? "text-gold border-b-2 border-gold"
              : "text-ivory-ghost hover:text-ivory-dim"
            }`}
        >
          <Globe size={12} />
          World
        </button>
      </div>

      {/* Action button - specific to view */}
      {activeView === "writing" && (
        <div className="px-2 py-2 border-b border-ink-border">
          <button
            onClick={() => setShowCreateDocumentModal(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
          >
            <Plus size={13} />
            Add New Document
          </button>
        </div>
      )}

      {activeView === "worldbuilding" && (
        <div className="px-2 py-2 border-b border-ink-border">
          <button
            onClick={() => setShowCreateEntityModal(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
          >
            <Plus size={13} />
            New Entity
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {activeView === "writing" ? (
          <>
            {rootDocuments.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <BookOpen size={24} className="mx-auto mb-3 text-ivory-ghost opacity-40" />
                <p className="text-xs text-ivory-ghost">No documents yet.</p>
              </div>
            ) : (
              <div className="space-y-0.5 px-1">
                {rootDocuments.map((doc) => (
                  <DocNode key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="px-2 py-2 space-y-1">
            {entityTypes.length === 0 ? (
              <p className="px-2 py-6 text-xs text-ivory-ghost text-center">
                No entity types yet.
              </p>
            ) : (
              entityTypes.map((et) => (
                <div
                  key={et.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-ivory-dim hover:bg-ink-muted hover:text-ivory cursor-pointer transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: et.color ?? "#c9a84c" }}
                  />
                  {et.name_plural ?? et.name}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer action - only for writing view with documents */}
      {activeView === "writing" && rootDocuments.length > 0 && (
        <div className="border-t border-ink-border p-2">
          <button
            onClick={createNovel}
            disabled={creating}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
          >
            <Plus size={13} />
            New document
          </button>
        </div>
      )}
    </aside>
  );
}

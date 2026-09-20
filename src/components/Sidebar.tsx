import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Plus, ChevronRight, ChevronDown, Feather, Globe, Layers, Folder, Trash2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeListRootDocuments,
  invokeListChildDocuments,
  invokeDeleteDocument,
  invokeListEntityTypes,
  invokeUpdateDocument,
} from "../hooks/useTauri";
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

const NODE_ICON: Record<string, React.ElementType> = {
  novel: BookOpen,
  part: Layers,
  chapter: FileText,
  scene: Feather,
  note: FileText,
  document: FileText,
  folder: Folder,
};

function DocNode({ doc, depth = 0 }: { doc: Document; depth?: number }) {
  const {
    selectedDocumentId,
    setSelectedDocumentId,
    childrenMap,
    setChildren,
    removeDocument,
    updateDocument,
    reorderDocuments,
  } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(doc.title);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const children = childrenMap[doc.id] ?? null;
  const hasChildren = doc.node_type === "novel" || doc.node_type === "part" || doc.node_type === "folder";
  const isSelected = selectedDocumentId === doc.id;
  const Icon = NODE_ICON[doc.node_type] ?? FileText;

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setDraftTitle(doc.title); }, [doc.title, editing]);

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
    setExpanded((value) => !value);
  }

  async function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    await invokeDeleteDocument(doc.id);
    removeDocument(doc.id);
  }

  function startEditing(event: React.MouseEvent) {
    event.stopPropagation();
    setDraftTitle(doc.title);
    setEditing(true);
  }

  async function commitRename() {
    const trimmed = draftTitle.trim() || doc.title;
    setEditing(false);
    if (trimmed === doc.title) return;
    try {
      const updated = await invokeUpdateDocument(doc.id, { title: trimmed });
      updateDocument(updated);
    } catch {
      setDraftTitle(doc.title);
    }
  }

  function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setDraftTitle(doc.title);
      setEditing(false);
    }
  }

  async function persistOrder(parentId: string | null, order: Document[]) {
    await Promise.all(
      order.map((item, index) =>
        invokeUpdateDocument(item.id, { sort_order: index }).catch(() => undefined)
      )
    );
    if (parentId !== null) {
      setChildren(parentId, order);
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedId || draggedId === doc.id) return;
    const parentId = doc.parent_id ?? null;
    reorderDocuments(parentId, draggedId, doc.id);
    const list = parentId === null
      ? useAppStore.getState().rootDocuments
      : useAppStore.getState().childrenMap[parentId] ?? [];
    const nextOrder = list.filter((item) => item.id !== draggedId || item.id === doc.id);
    void persistOrder(parentId, nextOrder);
    setDraggedId(null);
  }

  return (
    <div>
      <div
        draggable={!editing}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          setDraggedId(doc.id);
        }}
        onDragOver={(event) => {
          if (draggedId && draggedId !== doc.id) event.preventDefault();
        }}
        onDrop={handleDrop}
        onDragEnd={() => setDraggedId(null)}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors ${editing ? "bg-ink-muted" : "cursor-move"} ${isSelected && !editing ? "bg-gold/20 text-gold" : "text-ivory-dim hover:bg-ink-muted hover:text-ivory"}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => { if (!editing) { setSelectedDocumentId(doc.id); toggle(); } }}
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

        {editing ? (
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitRename}
            onKeyDown={handleInputKey}
            onClick={(event) => event.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent text-ivory text-sm focus:outline-none selectable"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate" onDoubleClick={startEditing}>{doc.title}</span>
        )}

        {!editing && (
          <>
            <span className={`flex-shrink-0 text-[10px] font-mono ${STATUS_COLORS[doc.status]}`} title={`Estado: ${STATUS_LABELS[doc.status]}`}>
              {STATUS_LABELS[doc.status]}
            </span>
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all"
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </>
        )}
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

export function Sidebar() {
  const {
    activeView,
    setActiveView,
    projectId,
    rootDocuments,
    setRootDocuments,
    entityTypes,
    setEntityTypes,
    setShowCreateEntityModal,
    setShowCreateDocumentModal,
  } = useAppStore();

  useEffect(() => {
    if (!projectId) return;
    invokeListRootDocuments(projectId).then(setRootDocuments).catch(console.error);
    invokeListEntityTypes(projectId).then(setEntityTypes).catch(console.error);
  }, [projectId]);

  return (
    <aside className="flex flex-col h-full bg-ink-deep border-r border-ink-border select-none">
      <div className="flex border-b border-ink-border">
        <button onClick={() => setActiveView("writing")} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-mono tracking-wider uppercase transition-colors ${activeView === "writing" ? "text-gold border-b-2 border-gold" : "text-ivory-ghost hover:text-ivory-dim"}`}><Feather size={12} />Write</button>
        <button onClick={() => setActiveView("worldbuilding")} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-mono tracking-wider uppercase transition-colors ${activeView === "worldbuilding" ? "text-gold border-b-2 border-gold" : "text-ivory-ghost hover:text-ivory-dim"}`}><Globe size={12} />World</button>
      </div>

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
              <p className="px-2 py-6 text-xs text-ivory-ghost text-center">No entity types yet.</p>
            ) : (
              entityTypes.map((entityType) => (
                <div
                  key={entityType.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-ivory-dim hover:bg-ink-muted hover:text-ivory cursor-pointer transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entityType.color ?? "#c9a84c" }}
                  />
                  {entityType.name_plural ?? entityType.name}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

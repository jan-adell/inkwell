import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Plus, ChevronRight, ChevronDown, Feather, Globe, Folder, Trash2 } from "lucide-react";
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
  scene: Feather,
  note: FileText,
  document: FileText,
  folder: Folder,
};

function ListEndDropZone({ parentId, index, depth }: { parentId: string | null; index: number; depth: number }) {
  const { moveDocument } = useAppStore();
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("text/plain")) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragOver(false);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData("text/plain");
    setIsDragOver(false);
    if (!draggedId) return;
    moveDocument(draggedId, parentId, index);
    const newList = parentId === null
      ? useAppStore.getState().rootDocuments
      : useAppStore.getState().childrenMap[parentId] ?? [];
    void Promise.all(
      newList.map((d, i) => invokeUpdateDocument(d.id, { sort_order: i, parent_id: parentId }).catch(() => {}))
    );
  }

  return (
    <div
      className="relative"
      style={{ height: isDragOver ? '16px' : '8px' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {isDragOver && <div className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-gold/70 pointer-events-none" style={{ left: `${8 + depth * 16}px`, right: 0 }} />}
    </div>
  );
}

function DocNode({ doc, depth = 0 }: { doc: Document; depth?: number }) {
  const {
    selectedDocumentId,
    setSelectedDocumentId,
    childrenMap,
    setChildren,
    removeDocument,
    updateDocument,
    moveDocument,
  } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(doc.title);
  const [dragOver, setDragOver] = useState<'above' | 'into' | 'below' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFolder = doc.node_type === "folder";
  const children = childrenMap[doc.id] ?? null;
  const isSelected = selectedDocumentId === doc.id;
  const Icon = NODE_ICON[doc.node_type] ?? FileText;

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setDraftTitle(doc.title); }, [doc.title, editing]);

  async function toggle() {
    if (!isFolder) return;
    if (!expanded && children === null) {
      setLoading(true);
      try {
        const kids = await invokeListChildDocuments(doc.id);
        setChildren(doc.id, kids);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
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

  function getDropZone(event: React.DragEvent<HTMLDivElement>): 'above' | 'into' | 'below' {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    if (isFolder) {
      if (ratio < 0.3) return 'above';
      if (ratio > 0.7) return 'below';
      return 'into';
    }
    return ratio < 0.5 ? 'above' : 'below';
  }

  function handleDragStart(event: React.DragEvent) {
    event.dataTransfer.setData("text/plain", doc.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("text/plain")) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(getDropZone(event));
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOver(null);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData("text/plain");
    setDragOver(null);
    if (!draggedId || draggedId === doc.id) return;
    const zone = getDropZone(event);
    const state = useAppStore.getState();

    if (zone === 'into') {
      moveDocument(draggedId, doc.id, 0);
      setExpanded(true);
      void invokeUpdateDocument(draggedId, { parent_id: doc.id, sort_order: 0 })
        .then(() => invokeListChildDocuments(doc.id))
        .then((kids) => setChildren(doc.id, kids))
        .catch(() => {});
    } else {
      const parentId = doc.parent_id ?? null;
      const list = parentId === null ? state.rootDocuments : (state.childrenMap[parentId] ?? []);
      let idx = list.findIndex((d) => d.id === doc.id);
      if (idx === -1) return;
      if (zone === 'below') idx += 1;
      moveDocument(draggedId, parentId, idx);
      const newList = parentId === null
        ? useAppStore.getState().rootDocuments
        : useAppStore.getState().childrenMap[parentId] ?? [];
      void Promise.all(
        newList.map((d, i) => invokeUpdateDocument(d.id, { sort_order: i, parent_id: parentId }).catch(() => {}))
      );
    }
  }

  return (
    <div className="relative">
      {dragOver === 'above' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold/70 z-10 pointer-events-none" />}
      {dragOver === 'below' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold/70 z-10 pointer-events-none" />}
      <div
        draggable={!editing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnd={() => setDragOver(null)}
        onDrop={handleDrop}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors ${editing ? "bg-ink-muted" : "cursor-move"} ${isSelected && !editing ? "bg-gold/20 text-gold" : "text-ivory-dim hover:bg-ink-muted hover:text-ivory"} ${dragOver === 'into' ? 'ring-1 ring-gold/70 bg-gold/10' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => { if (!editing) { setSelectedDocumentId(doc.id); toggle(); } }}
      >
        {isFolder ? (
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
          <ListEndDropZone parentId={doc.id} index={children.length} depth={depth + 1} />
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
                <ListEndDropZone parentId={null} index={rootDocuments.length} depth={0} />
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

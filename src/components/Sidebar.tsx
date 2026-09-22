import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Plus, ChevronRight, ChevronDown, Feather, Globe, Folder, Trash2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  invokeListRootDocuments,
  invokeListChildDocuments,
  invokeDeleteDocument,
  invokeListEntityTypes,
  invokeUpdateDocument,
  invokeListEntityFolders,
  invokeUpdateEntityFolder,
  invokeDeleteEntityFolder,
  invokeListRootEntities,
  invokeListEntitiesByFolder,
  invokeUpdateEntity,
  invokeDeleteEntity,
} from "../hooks/useTauri";
import type { Document, Entity, EntityFolder, EntityType } from "../types/core";

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
  const { moveDocument, setDraggingId } = useAppStore();
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!useAppStore.getState().draggingId) return;
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
    const draggedId = event.dataTransfer.getData("text/plain") || useAppStore.getState().draggingId || "";
    setIsDragOver(false);
    setDraggingId(null);
    if (!draggedId) return;
    moveDocument(draggedId, parentId, index);
    const newList = parentId === null
      ? useAppStore.getState().rootDocuments
      : useAppStore.getState().childrenMap[parentId] ?? [];
    void Promise.all(
      newList.map((d, i) => invokeUpdateDocument(d.id, { sort_order: i, parent_id: parentId }))
    ).catch(console.error);
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
    setDraggingId,
  } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(doc.title);
  const [dragOver, setDragOver] = useState<'above' | 'into' | 'below' | null>(null);
  const [confirming, setConfirming] = useState(false);
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

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    setConfirming(true);
  }

  async function confirmDelete() {
    setConfirming(false);
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
    setDraggingId(doc.id);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!useAppStore.getState().draggingId) return;
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
    const draggedId = event.dataTransfer.getData("text/plain") || useAppStore.getState().draggingId || "";
    setDragOver(null);
    setDraggingId(null);
    if (!draggedId || draggedId === doc.id) return;
    const zone = getDropZone(event);
    const state = useAppStore.getState();

    if (zone === 'into') {
      moveDocument(draggedId, doc.id, 0);
      setExpanded(true);
      invokeListChildDocuments(doc.id)
        .then(kidsBeforeMove => {
          const others = kidsBeforeMove.filter(k => k.id !== draggedId);
          return Promise.all([
            invokeUpdateDocument(draggedId, { parent_id: doc.id, sort_order: 0 }),
            ...others.map((k, i) => invokeUpdateDocument(k.id, { parent_id: doc.id, sort_order: i + 1 })),
          ]);
        })
        .then(() => invokeListChildDocuments(doc.id))
        .then(kids => setChildren(doc.id, kids))
        .catch(console.error);
    } else {
      const parentId = doc.parent_id ?? null;
      const list = parentId === null ? state.rootDocuments : (state.childrenMap[parentId] ?? []);
      const filteredList = list.filter(d => d.id !== draggedId);
      let idx = filteredList.findIndex(d => d.id === doc.id);
      if (idx === -1) return;
      if (zone === 'below') idx += 1;
      moveDocument(draggedId, parentId, idx);
      const newList = parentId === null
        ? useAppStore.getState().rootDocuments
        : useAppStore.getState().childrenMap[parentId] ?? [];
      void Promise.all(
        newList.map((d, i) => invokeUpdateDocument(d.id, { sort_order: i, parent_id: parentId }))
      ).catch(console.error);
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
        onDragEnd={() => { setDragOver(null); setDraggingId(null); }}
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
      {confirming && (
        <ConfirmDialog
          title={`Delete "${doc.title}"?`}
          description="This document will be permanently deleted and cannot be recovered."
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function EntityRow({
  entity,
  entityType,
  parentFolderId,
  onDeleted,
  onRenamed,
}: {
  entity: Entity;
  entityType: EntityType | undefined;
  parentFolderId: string | null;
  onDeleted: (id: string) => void;
  onRenamed: (updated: Entity) => void;
}) {
  const { selectedEntityId, setSelectedEntityId, setDraggingId } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(entity.name);
  const [dragOver, setDragOver] = useState<'above' | 'below' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelected = selectedEntityId === entity.id;

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setDraftName(entity.name); }, [entity.name, editing]);

  function getZone(event: React.DragEvent<HTMLDivElement>): 'above' | 'below' {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
  }

  function handleDragStart(event: React.DragEvent) {
    event.dataTransfer.setData("text/plain", entity.id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(entity.id);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!useAppStore.getState().draggingId) return;
    if (leaveTimerRef.current !== null) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    event.preventDefault();
    event.stopPropagation();
    setDragOver(getZone(event));
  }

  function handleDragLeave() {
    leaveTimerRef.current = setTimeout(() => { setDragOver(null); leaveTimerRef.current = null; }, 80);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData("text/plain") || useAppStore.getState().draggingId || "";
    const zone = getZone(event);
    setDragOver(null);
    setDraggingId(null);
    if (!draggedId || draggedId === entity.id) return;

    const state = useAppStore.getState();

    if (state.entityFolders.some((f) => f.id === draggedId)) return;

    const { folderId: fromFolderId, list: fromList } = findEntityContext(draggedId, state);
    if (!fromList.some((e) => e.id === draggedId)) return;

    const targetFolderId = parentFolderId;
    const toList = targetFolderId === null
      ? [...state.rootEntities]
      : [...(state.entitiesByFolder[targetFolderId] ?? [])];

    if (fromFolderId === targetFolderId) {
      if (targetFolderId === null) {
        const merged = getMergedRootItems(state).filter(item => item.id !== draggedId);
        const targetIdx = merged.findIndex(item => item.id === entity.id);
        if (targetIdx === -1) return;
        const insertAt = zone === 'below' ? targetIdx + 1 : targetIdx;
        merged.splice(insertAt, 0, { kind: 'entity', id: draggedId, sort_order: 0 });
        void applyMergedReorder(merged, state);
      } else {
        const filteredList = toList.filter((e) => e.id !== draggedId);
        let idx = filteredList.findIndex((e) => e.id === entity.id);
        if (idx === -1) return;
        if (zone === 'below') idx += 1;
        const dragged = toList.find((e) => e.id === draggedId)!;
        filteredList.splice(idx, 0, dragged);
        state.setEntitiesForFolder(targetFolderId, filteredList);
        void Promise.all(filteredList.map((e, i) => invokeUpdateEntity(e.id, { sort_order: i }))).catch(console.error);
      }
    } else {
      const dragged = fromList.find((e) => e.id === draggedId)!;
      const updatedFromList = fromList.filter((e) => e.id !== draggedId);
      if (fromFolderId === null) state.setRootEntities(updatedFromList);
      else state.setEntitiesForFolder(fromFolderId, updatedFromList);

      const filteredTo = toList.filter((e) => e.id !== draggedId);
      let idx = filteredTo.findIndex((e) => e.id === entity.id);
      if (idx === -1) idx = filteredTo.length;
      else if (zone === 'below') idx += 1;
      filteredTo.splice(idx, 0, { ...dragged, folder_id: targetFolderId });
      if (targetFolderId === null) state.setRootEntities(filteredTo);
      else state.setEntitiesForFolder(targetFolderId, filteredTo);

      void Promise.all([
        ...updatedFromList.map((e, i) => invokeUpdateEntity(e.id, { sort_order: i })),
        ...filteredTo.map((e, i) =>
          invokeUpdateEntity(e.id, { sort_order: i, ...(e.id === draggedId ? { folder_id: targetFolderId } : {}) })
        ),
      ]).catch(console.error);
    }
  }

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    setConfirming(true);
  }

  async function confirmDelete() {
    setConfirming(false);
    await invokeDeleteEntity(entity.id);
    onDeleted(entity.id);
  }

  function startEditing(event: React.MouseEvent) {
    event.stopPropagation();
    setDraftName(entity.name);
    setEditing(true);
  }

  async function commitRename() {
    const trimmed = draftName.trim() || entity.name;
    setEditing(false);
    if (trimmed === entity.name) return;
    try {
      const updated = await invokeUpdateEntity(entity.id, { name: trimmed });
      onRenamed(updated);
    } catch {
      setDraftName(entity.name);
    }
  }

  function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setDraftName(entity.name);
      setEditing(false);
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
        onDragEnd={() => { setDragOver(null); setDraggingId(null); }}
        onDrop={handleDrop}
        className={`group flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors ${editing ? "bg-ink-muted" : "cursor-move"} ${isSelected && !editing ? "bg-gold/20 text-gold" : "text-ivory-dim hover:bg-ink-muted hover:text-ivory"}`}
        style={{ paddingLeft: "24px" }}
        onClick={() => { if (!editing) setSelectedEntityId(entity.id); }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: entityType?.color ?? "#c9a84c" }}
        />
        {editing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={handleInputKey}
            onClick={(event) => event.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent text-ivory text-sm focus:outline-none selectable"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate" onDoubleClick={startEditing}>{entity.name}</span>
        )}
        {!editing && (
          <>
            <span className="text-[10px] text-ivory-ghost flex-shrink-0">{entityType?.name ?? ""}</span>
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all"
              title="Delete entity"
            >
              <Trash2 size={11} />
            </button>
          </>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Delete "${entity.name}"?`}
          description="This entity will be permanently deleted."
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function findEntityContext(
  entityId: string,
  state: ReturnType<typeof useAppStore.getState>,
): { folderId: string | null; list: Entity[] } {
  if (state.rootEntities.some((e) => e.id === entityId))
    return { folderId: null, list: state.rootEntities };
  for (const [folderId, entities] of Object.entries(state.entitiesByFolder)) {
    if (entities.some((e) => e.id === entityId))
      return { folderId, list: entities };
  }
  return { folderId: null, list: [] };
}

export type MergedItem = { kind: 'folder'; id: string; sort_order: number } | { kind: 'entity'; id: string; sort_order: number };

export function getMergedRootItems(state: ReturnType<typeof useAppStore.getState>): MergedItem[] {
  return [
    ...state.entityFolders.map(f => ({ kind: 'folder' as const, id: f.id, sort_order: f.sort_order })),
    ...state.rootEntities.map(e => ({ kind: 'entity' as const, id: e.id, sort_order: e.sort_order })),
  ].sort((a, b) => a.sort_order - b.sort_order || (a.kind === 'folder' ? -1 : 1));
}

async function applyMergedReorder(
  newMerged: MergedItem[],
  state: ReturnType<typeof useAppStore.getState>,
) {
  const updatedFolders = state.entityFolders.map(f => ({
    ...f, sort_order: newMerged.findIndex(item => item.id === f.id),
  }));
  const updatedEntities = state.rootEntities.map(e => ({
    ...e, sort_order: newMerged.findIndex(item => item.id === e.id),
  }));
  state.setEntityFolders(updatedFolders);
  state.setRootEntities(updatedEntities);
  void Promise.all([
    ...updatedFolders.map(f => invokeUpdateEntityFolder(f.id, { sort_order: f.sort_order })),
    ...updatedEntities.map(e => invokeUpdateEntity(e.id, { sort_order: e.sort_order })),
  ]).catch(console.error);
}

function EntityFolderRow({
  folder,
  projectId,
  entityTypes,
}: {
  folder: EntityFolder;
  projectId: string;
  entityTypes: EntityType[];
}) {
  const { entitiesByFolder, setEntitiesForFolder, entityFolders, setEntityFolders, setDraggingId } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);
  const [dragOver, setDragOver] = useState<'above' | 'into' | 'below' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entities = entitiesByFolder[folder.id] ?? null;

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setDraftName(folder.name); }, [folder.name, editing]);

  function getZone(event: React.DragEvent<HTMLDivElement>): 'above' | 'into' | 'below' {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    if (ratio < 0.3) return 'above';
    if (ratio > 0.7) return 'below';
    return 'into';
  }

  function handleDragStart(event: React.DragEvent) {
    event.dataTransfer.setData("text/plain", folder.id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(folder.id);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!useAppStore.getState().draggingId) return;
    if (leaveTimerRef.current !== null) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    event.preventDefault();
    event.stopPropagation();
    const state = useAppStore.getState();
    const draggedId = state.draggingId ?? "";
    const isFolder = state.entityFolders.some((f) => f.id === draggedId);
    const zone = getZone(event);
    setDragOver(isFolder && zone === 'into' ? 'below' : zone);
  }

  function handleDragLeave() {
    leaveTimerRef.current = setTimeout(() => { setDragOver(null); leaveTimerRef.current = null; }, 80);
  }

  async function handleFolderDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData("text/plain") || useAppStore.getState().draggingId || "";
    const zone = getZone(event);
    setDragOver(null);
    setDraggingId(null);
    if (!draggedId || draggedId === folder.id) return;

    const state = useAppStore.getState();
    const isFolder = state.entityFolders.some((f) => f.id === draggedId);

    if (isFolder) {
      const effectiveZone = zone === 'into' ? 'below' : zone;
      const merged = getMergedRootItems(state).filter(item => item.id !== draggedId);
      const targetIdx = merged.findIndex(item => item.id === folder.id);
      if (targetIdx === -1) return;
      const insertAt = effectiveZone === 'below' ? targetIdx + 1 : targetIdx;
      const dragged = state.entityFolders.find(f => f.id === draggedId);
      if (!dragged) return;
      merged.splice(insertAt, 0, { kind: 'folder', id: draggedId, sort_order: 0 });
      void applyMergedReorder(merged, state);
      return;
    }

    if (zone === 'into') {
      const { folderId: fromFolderId, list: fromList } = findEntityContext(draggedId, state);
      if (fromFolderId === folder.id) return;
      const dragged = fromList.find((e) => e.id === draggedId);
      if (!dragged) return;

      const updatedFromList = fromList.filter((e) => e.id !== draggedId);
      if (fromFolderId === null) state.setRootEntities(updatedFromList);
      else state.setEntitiesForFolder(fromFolderId, updatedFromList);

      const folderEntities = [...(state.entitiesByFolder[folder.id] ?? [])];
      state.setEntitiesForFolder(folder.id, [...folderEntities, { ...dragged, folder_id: folder.id }]);
      if (!expanded) setExpanded(true);

      void Promise.all([
        invokeUpdateEntity(draggedId, { folder_id: folder.id, sort_order: folderEntities.length }),
        ...updatedFromList.map((e, i) => invokeUpdateEntity(e.id, { sort_order: i })),
      ]).catch(console.error);
      return;
    }

    // Entity dropped above/below folder → move to root at this merged-list position
    const { folderId: fromFolderId, list: fromList } = findEntityContext(draggedId, state);
    const dragged = fromList.find((e) => e.id === draggedId);
    if (!dragged) return;

    const updatedFromList = fromList.filter((e) => e.id !== draggedId);
    if (fromFolderId !== null) state.setEntitiesForFolder(fromFolderId, updatedFromList);

    const stateAfterRemove = {
      ...state,
      rootEntities: fromFolderId === null ? updatedFromList : state.rootEntities,
    };
    const merged = getMergedRootItems(stateAfterRemove).filter(item => item.id !== draggedId);
    const targetIdx = merged.findIndex(item => item.id === folder.id);
    if (targetIdx === -1) return;
    const insertAt = zone === 'below' ? targetIdx + 1 : targetIdx;
    merged.splice(insertAt, 0, { kind: 'entity', id: draggedId, sort_order: 0 });

    const movedEntity = { ...dragged, folder_id: null as null };
    const newRootEntities = [...stateAfterRemove.rootEntities.filter(e => e.id !== draggedId), movedEntity];
    state.setRootEntities(newRootEntities);

    const updatedFolders = state.entityFolders.map(f => ({ ...f, sort_order: merged.findIndex(item => item.id === f.id) }));
    const updatedEntities = newRootEntities.map(e => ({ ...e, sort_order: merged.findIndex(item => item.id === e.id) }));
    state.setEntityFolders(updatedFolders);
    state.setRootEntities(updatedEntities);

    void Promise.all([
      ...updatedFolders.map(f => invokeUpdateEntityFolder(f.id, { sort_order: f.sort_order })),
      ...updatedEntities.map(e => invokeUpdateEntity(e.id, {
        sort_order: e.sort_order,
        ...(fromFolderId !== null && e.id === draggedId ? { folder_id: null } : {}),
      })),
      ...(fromFolderId !== null ? updatedFromList.map((e, i) => invokeUpdateEntity(e.id, { sort_order: i })) : []),
    ]).catch(console.error);
  }

  async function toggle() {
    if (editing) return;
    if (!expanded && entities === null) {
      setLoading(true);
      try {
        const items = await invokeListEntitiesByFolder(projectId, folder.id);
        setEntitiesForFolder(folder.id, items);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
  }

  function handleDeleteFolder(event: React.MouseEvent) {
    event.stopPropagation();
    setConfirming(true);
  }

  async function confirmDeleteFolder() {
    setConfirming(false);
    await invokeDeleteEntityFolder(folder.id);
    setEntityFolders(entityFolders.filter((f) => f.id !== folder.id));
  }

  function startEditing(event: React.MouseEvent) {
    event.stopPropagation();
    setDraftName(folder.name);
    setEditing(true);
  }

  async function commitRename() {
    const trimmed = draftName.trim() || folder.name;
    setEditing(false);
    if (trimmed === folder.name) return;
    try {
      const updated = await invokeUpdateEntityFolder(folder.id, { name: trimmed });
      setEntityFolders(entityFolders.map((f) => (f.id === updated.id ? updated : f)));
    } catch {
      setDraftName(folder.name);
    }
  }

  function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setDraftName(folder.name);
      setEditing(false);
    }
  }

  function handleEntityRenamed(updated: Entity) {
    const current = useAppStore.getState().entitiesByFolder[folder.id] ?? [];
    setEntitiesForFolder(folder.id, current.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleEntityDeleted(id: string) {
    const current = useAppStore.getState().entitiesByFolder[folder.id] ?? [];
    setEntitiesForFolder(folder.id, current.filter((e) => e.id !== id));
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
        onDragEnd={() => { setDragOver(null); setDraggingId(null); }}
        onDrop={handleFolderDrop}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded text-sm text-ivory-dim hover:bg-ink-muted hover:text-ivory transition-colors ${editing ? "bg-ink-muted cursor-default" : "cursor-move"} ${dragOver === 'into' ? "ring-1 ring-gold/60 bg-gold/10" : ""}`}
        onClick={() => void toggle()}
      >
        {loading ? (
          <span className="w-3 h-3 flex-shrink-0">
            <span className="block w-2 h-2 border border-ivory-ghost rounded-full animate-spin" />
          </span>
        ) : expanded ? (
          <ChevronDown size={12} className="flex-shrink-0 text-ivory-ghost" />
        ) : (
          <ChevronRight size={12} className="flex-shrink-0 text-ivory-ghost" />
        )}
        <Folder size={13} className="flex-shrink-0 opacity-60" />
        {editing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={handleInputKey}
            onClick={(event) => event.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent text-ivory text-xs font-medium uppercase tracking-wider focus:outline-none selectable"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-xs font-medium uppercase tracking-wider" onDoubleClick={startEditing}>{folder.name}</span>
        )}
        {!editing && (
          <button
            onClick={handleDeleteFolder}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all"
            title="Delete folder"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {expanded && (
        <div>
          {(entities ?? []).map((entity) => (
            <EntityRow
              key={entity.id}
              entity={entity}
              entityType={entityTypes.find((t) => t.id === entity.entity_type_id)}
              parentFolderId={folder.id}
              onDeleted={handleEntityDeleted}
              onRenamed={handleEntityRenamed}
            />
          ))}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Delete folder "${folder.name}"?`}
          description="The folder will be deleted. Entities inside it will be permanently removed too."
          onConfirm={confirmDeleteFolder}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function WorldEndDropZone() {
  const { setDraggingId } = useAppStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!useAppStore.getState().draggingId) return;
    if (leaveTimerRef.current !== null) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    leaveTimerRef.current = setTimeout(() => { setIsDragOver(false); leaveTimerRef.current = null; }, 80);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData("text/plain") || useAppStore.getState().draggingId || "";
    setIsDragOver(false);
    setDraggingId(null);
    if (!draggedId) return;

    const state = useAppStore.getState();
    const isFolder = state.entityFolders.some(f => f.id === draggedId);

    if (isFolder) {
      const merged = getMergedRootItems(state).filter(item => item.id !== draggedId);
      merged.push({ kind: 'folder', id: draggedId, sort_order: 0 });
      void applyMergedReorder(merged, state);
      return;
    }

    const { folderId: fromFolderId, list: fromList } = findEntityContext(draggedId, state);
    const dragged = fromList.find(e => e.id === draggedId);
    if (!dragged) return;

    const updatedFromList = fromList.filter(e => e.id !== draggedId);
    if (fromFolderId !== null) state.setEntitiesForFolder(fromFolderId, updatedFromList);

    const stateAfterRemove = {
      ...state,
      rootEntities: fromFolderId === null ? updatedFromList : state.rootEntities,
    };
    const merged = getMergedRootItems(stateAfterRemove).filter(item => item.id !== draggedId);
    merged.push({ kind: 'entity', id: draggedId, sort_order: 0 });

    const movedEntity = { ...dragged, folder_id: null as null };
    const newRootEntities = [...stateAfterRemove.rootEntities.filter(e => e.id !== draggedId), movedEntity];
    const updatedFolders = state.entityFolders.map(f => ({ ...f, sort_order: merged.findIndex(item => item.id === f.id) }));
    const updatedEntities = newRootEntities.map(e => ({ ...e, sort_order: merged.findIndex(item => item.id === e.id) }));
    state.setEntityFolders(updatedFolders);
    state.setRootEntities(updatedEntities);

    void Promise.all([
      ...updatedFolders.map(f => invokeUpdateEntityFolder(f.id, { sort_order: f.sort_order })),
      ...updatedEntities.map(e => invokeUpdateEntity(e.id, {
        sort_order: e.sort_order,
        ...(fromFolderId !== null && e.id === draggedId ? { folder_id: null } : {}),
      })),
      ...(fromFolderId !== null ? updatedFromList.map((e, i) => invokeUpdateEntity(e.id, { sort_order: i })) : []),
    ]).catch(console.error);
  }

  return (
    <div
      className="relative mx-1"
      style={{ height: isDragOver ? '16px' : '8px' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {isDragOver && <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gold/70 rounded" />}
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
    entityFolders,
    setEntityFolders,
    rootEntities,
    setRootEntities,
    setEntitiesForFolder,
    setShowCreateDocumentModal,
    setShowCreateEntityModal,
  } = useAppStore();

  useEffect(() => {
    if (!projectId) return;
    invokeListRootDocuments(projectId).then(setRootDocuments).catch(console.error);
    invokeListEntityTypes(projectId).then(setEntityTypes).catch(console.error);
    invokeListEntityFolders(projectId).then(folders => {
      setEntityFolders(folders);
      folders.forEach(folder => {
        invokeListEntitiesByFolder(projectId, folder.id)
          .then(entities => setEntitiesForFolder(folder.id, entities))
          .catch(console.error);
      });
    }).catch(console.error);
    invokeListRootEntities(projectId).then(setRootEntities).catch(console.error);
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
            Add New
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
          <div className="px-1 py-1 space-y-0.5">
            {[
              ...entityFolders.map(f => ({ kind: 'folder' as const, id: f.id, sort_order: f.sort_order })),
              ...rootEntities.map(e => ({ kind: 'entity' as const, id: e.id, sort_order: e.sort_order })),
            ]
              .sort((a, b) => a.sort_order - b.sort_order || (a.kind === 'folder' ? -1 : 1))
              .map(item =>
                item.kind === 'folder' ? (
                  <EntityFolderRow
                    key={item.id}
                    folder={entityFolders.find(f => f.id === item.id)!}
                    projectId={projectId!}
                    entityTypes={entityTypes}
                  />
                ) : (
                  <EntityRow
                    key={item.id}
                    entity={rootEntities.find(e => e.id === item.id)!}
                    entityType={entityTypes.find((t) => t.id === rootEntities.find(e => e.id === item.id)?.entity_type_id)}
                    parentFolderId={null}
                    onDeleted={(id) => setRootEntities(rootEntities.filter((e) => e.id !== id))}
                    onRenamed={(updated) => setRootEntities(rootEntities.map((e) => (e.id === updated.id ? updated : e)))}
                  />
                )
              )
            }
            <WorldEndDropZone />
          </div>
        )}
      </div>
    </aside>
  );
}

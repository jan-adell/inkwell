import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Plus, ChevronRight, ChevronDown, Feather, Globe, Folder, Trash2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  invokeListRootDocuments,
  invokeListChildDocuments,
  invokeDeleteDocument,
  invokeListEntityTypes,
  invokeUpdateDocument,
  invokeListEntityFolders,
  invokeCreateEntityFolder,
  invokeDeleteEntityFolder,
  invokeListRootEntities,
  invokeListEntitiesByFolder,
  invokeCreateEntity,
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
    </div>
  );
}

function EntityRow({
  entity,
  entityType,
  onDeleted,
}: {
  entity: Entity;
  entityType: EntityType | undefined;
  onDeleted: (id: string) => void;
}) {
  const { selectedEntityId, setSelectedEntityId } = useAppStore();
  const isSelected = selectedEntityId === entity.id;

  async function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    await invokeDeleteEntity(entity.id);
    onDeleted(entity.id);
  }

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${isSelected ? "bg-gold/20 text-gold" : "text-ivory-dim hover:bg-ink-muted hover:text-ivory"}`}
      style={{ paddingLeft: "24px" }}
      onClick={() => setSelectedEntityId(entity.id)}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: entityType?.color ?? "#c9a84c" }}
      />
      <span className="flex-1 min-w-0 truncate">{entity.name}</span>
      <span className="text-[10px] text-ivory-ghost flex-shrink-0">{entityType?.name ?? ""}</span>
      <button
        onClick={handleDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all"
        title="Delete entity"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function AddEntityInline({
  folderId,
  projectId,
  entityTypes,
  onCreated,
}: {
  folderId: string | null;
  projectId: string;
  entityTypes: EntityType[];
  onCreated: (entity: Entity) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState(entityTypes[0]?.id ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || !typeId) { setOpen(false); return; }
    try {
      const entity = await invokeCreateEntity(projectId, {
        entity_type_id: typeId,
        name: trimmed,
        folder_id: folderId,
      });
      onCreated(entity);
    } catch {
      // ignore
    }
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-0.5 text-xs text-ivory-ghost hover:text-ivory transition-colors"
        style={{ paddingLeft: folderId ? "32px" : "8px" }}
      >
        <Plus size={11} />
        New entity
      </button>
    );
  }

  return (
    <div className="px-2 py-1 space-y-1" style={{ paddingLeft: folderId ? "28px" : "8px" }}>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Entity name…"
        className="w-full bg-ink-muted text-ivory text-xs px-2 py-1 rounded focus:outline-none"
      />
      <select
        value={typeId}
        onChange={(e) => setTypeId(e.target.value)}
        className="w-full bg-ink-muted text-ivory-dim text-xs px-2 py-1 rounded focus:outline-none"
      >
        {entityTypes.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <div className="flex gap-1">
        <button onClick={() => void submit()} className="flex-1 text-xs bg-gold/20 text-gold rounded py-0.5 hover:bg-gold/30">Add</button>
        <button onClick={() => setOpen(false)} className="flex-1 text-xs text-ivory-ghost rounded py-0.5 hover:bg-ink-muted">Cancel</button>
      </div>
    </div>
  );
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
  const { entitiesByFolder, setEntitiesForFolder } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const entities = entitiesByFolder[folder.id] ?? null;

  async function toggle() {
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

  async function handleDeleteFolder(event: React.MouseEvent) {
    event.stopPropagation();
    await invokeDeleteEntityFolder(folder.id);
    const { entityFolders, setEntityFolders } = useAppStore.getState();
    setEntityFolders(entityFolders.filter((f) => f.id !== folder.id));
  }

  function handleEntityCreated(entity: Entity) {
    const current = useAppStore.getState().entitiesByFolder[folder.id] ?? [];
    useAppStore.getState().setEntitiesForFolder(folder.id, [...current, entity]);
    if (!expanded) setExpanded(true);
  }

  function handleEntityDeleted(id: string) {
    const current = useAppStore.getState().entitiesByFolder[folder.id] ?? [];
    useAppStore.getState().setEntitiesForFolder(folder.id, current.filter((e) => e.id !== id));
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 px-2 py-1 rounded text-sm text-ivory-dim hover:bg-ink-muted hover:text-ivory cursor-pointer transition-colors"
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
        <span className="flex-1 min-w-0 truncate text-xs font-medium uppercase tracking-wider">{folder.name}</span>
        <button
          onClick={handleDeleteFolder}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ivory-ghost hover:text-crimson transition-all"
          title="Delete folder"
        >
          <Trash2 size={11} />
        </button>
      </div>
      {expanded && (
        <div>
          {(entities ?? []).map((entity) => (
            <EntityRow
              key={entity.id}
              entity={entity}
              entityType={entityTypes.find((t) => t.id === entity.entity_type_id)}
              onDeleted={handleEntityDeleted}
            />
          ))}
          <AddEntityInline
            folderId={folder.id}
            projectId={projectId}
            entityTypes={entityTypes}
            onCreated={handleEntityCreated}
          />
        </div>
      )}
    </div>
  );
}

function AddFolderInline({ projectId }: { projectId: string }) {
  const { entityFolders, setEntityFolders } = useAppStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setOpen(false); return; }
    try {
      const folder = await invokeCreateEntityFolder(projectId, { name: trimmed });
      setEntityFolders([...entityFolders, folder]);
    } catch {
      // ignore
    }
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-0.5 text-xs text-ivory-ghost hover:text-ivory transition-colors"
      >
        <Plus size={11} />
        New folder
      </button>
    );
  }

  return (
    <div className="px-2 py-1">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Folder name…"
        className="w-full bg-ink-muted text-ivory text-xs px-2 py-1 rounded focus:outline-none"
      />
      <div className="flex gap-1 mt-1">
        <button onClick={() => void submit()} className="flex-1 text-xs bg-gold/20 text-gold rounded py-0.5 hover:bg-gold/30">Add</button>
        <button onClick={() => setOpen(false)} className="flex-1 text-xs text-ivory-ghost rounded py-0.5 hover:bg-ink-muted">Cancel</button>
      </div>
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
    setShowCreateDocumentModal,
  } = useAppStore();

  useEffect(() => {
    if (!projectId) return;
    invokeListRootDocuments(projectId).then(setRootDocuments).catch(console.error);
    invokeListEntityTypes(projectId).then(setEntityTypes).catch(console.error);
    invokeListEntityFolders(projectId).then(setEntityFolders).catch(console.error);
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
          <p className="text-[10px] text-ivory-ghost uppercase tracking-wider px-1 mb-1">World</p>
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
            {entityFolders.map((folder) => (
              <EntityFolderRow
                key={folder.id}
                folder={folder}
                projectId={projectId!}
                entityTypes={entityTypes}
              />
            ))}
            {rootEntities.map((entity) => (
              <EntityRow
                key={entity.id}
                entity={entity}
                entityType={entityTypes.find((t) => t.id === entity.entity_type_id)}
                onDeleted={(id) => setRootEntities(rootEntities.filter((e) => e.id !== id))}
              />
            ))}
            {projectId && (
              <>
                <AddEntityInline
                  folderId={null}
                  projectId={projectId}
                  entityTypes={entityTypes}
                  onCreated={(entity) => setRootEntities([...rootEntities, entity])}
                />
                <AddFolderInline projectId={projectId} />
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

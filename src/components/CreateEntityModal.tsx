import { useState } from "react";
import { X, Plus, Folder } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { invokeCreateEntity, invokeCreateEntityFolder } from "../hooks/useTauri";

export function CreateEntityModal() {
  const {
    showCreateEntityModal,
    setShowCreateEntityModal,
    projectId,
    entityTypes,
    rootEntities,
    setRootEntities,
    entityFolders,
    setEntityFolders,
    setSelectedEntityId,
  } = useAppStore();
  const [creating, setCreating] = useState(false);

  if (!showCreateEntityModal || !projectId) return null;

  async function createEntity(entityTypeId: string) {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const entity = await invokeCreateEntity(projectId, {
        entity_type_id: entityTypeId,
        name: "New Entity",
      });
      setRootEntities([...rootEntities, entity]);
      setSelectedEntityId(entity.id);
      setShowCreateEntityModal(false);
    } finally {
      setCreating(false);
    }
  }

  async function createFolder() {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const folder = await invokeCreateEntityFolder(projectId, { name: "New Folder" });
      setEntityFolders([...entityFolders, folder]);
      setShowCreateEntityModal(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setShowCreateEntityModal(false)} />
      <div className="fixed z-50 pointer-events-none" style={{ left: "250px", top: "70px" }}>
        <div className="pointer-events-auto bg-ink-deep border border-ink-border rounded-lg shadow-2xl w-72 relative">
          <div className="absolute -left-2 top-6 w-2 h-2 bg-ink-deep border-l border-t border-ink-border transform rotate-45" />
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-border">
            <h2 className="text-sm font-display text-gold tracking-wide">New</h2>
            <button
              onClick={() => setShowCreateEntityModal(false)}
              className="p-1 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div className="px-4 py-3 space-y-2">
            {entityTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => void createEntity(type.id)}
                disabled={creating}
                className="w-full flex items-center justify-between px-3 py-2 rounded border hover:opacity-90 transition-all group font-mono text-xs uppercase tracking-wider disabled:opacity-50"
                style={{
                  borderColor: type.color ?? "#c9a84c",
                  color: type.color ?? "#c9a84c",
                  backgroundColor: `${type.color ?? "#c9a84c"}22`,
                }}
              >
                <span>{type.name}</span>
                <Plus size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            <button
              onClick={() => void createFolder()}
              disabled={creating}
              className="w-full flex items-center justify-between px-3 py-2 rounded bg-ink-surface border border-ink-border hover:bg-ink-muted text-ivory transition-all group font-mono text-xs uppercase tracking-wider disabled:opacity-50"
            >
              <span>Folder</span>
              <Folder size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { invokeCreateDocument } from "../hooks/useTauri";

export function CreateDocumentModal() {
  const {
    showCreateDocumentModal, setShowCreateDocumentModal,
    projectId, addDocument, setSelectedDocumentId,
  } = useAppStore();
  const [creating, setCreating] = useState(false);

  if (!showCreateDocumentModal) return null;

  async function handleCreateDocument() {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const doc = await invokeCreateDocument(projectId, {
        node_type: "document",
        title: "Untitled Document",
      });
      addDocument(doc);
      setSelectedDocumentId(doc.id);
      setShowCreateDocumentModal(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setShowCreateDocumentModal(false)} />
      <div className="fixed z-50 pointer-events-none" style={{ left: "250px", top: "70px" }}>
        <div className="pointer-events-auto bg-ink-deep border border-ink-border rounded-lg shadow-2xl w-72 relative">
          <div className="absolute -left-2 top-6 w-2 h-2 bg-ink-deep border-l border-t border-ink-border transform rotate-45" />
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-border">
            <h2 className="text-sm font-display text-gold tracking-wide">Nuevo Documento</h2>
            <button
              onClick={() => setShowCreateDocumentModal(false)}
              className="p-1 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
          <div className="px-4 py-3">
            <button
              onClick={handleCreateDocument}
              disabled={creating}
              className="w-full flex items-center justify-between px-3 py-2 rounded bg-gold/20 border border-gold/40 hover:bg-gold/30 hover:border-gold text-gold transition-all group font-mono text-xs uppercase tracking-wider disabled:opacity-50"
            >
              <span>Documento</span>
              <Plus size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

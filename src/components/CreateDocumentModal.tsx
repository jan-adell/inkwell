import { X, Plus } from "lucide-react";
import { useAppStore } from "../store/appStore";

export function CreateDocumentModal() {
  const { showCreateDocumentModal, setShowCreateDocumentModal } = useAppStore();

  if (!showCreateDocumentModal) {
    return null;
  }

  const documentTypes = [
    { id: "document", label: "Document" },
    { id: "draft", label: "Draft" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setShowCreateDocumentModal(false)}
      />

      {/* Popover Bubble - positioned to the right with arrow pointer */}
      <div className="fixed z-50 pointer-events-none" style={{ left: "250px", top: "70px" }}>
        <div className="pointer-events-auto bg-ink-deep border border-ink-border rounded-lg shadow-2xl w-72 relative">
          {/* Arrow pointer to the left */}
          <div className="absolute -left-2 top-6 w-2 h-2 bg-ink-deep border-l border-t border-ink-border transform rotate-45" />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-border">
            <h2 className="text-sm font-display text-gold tracking-wide">
              Nuevo Documento
            </h2>
            <button
              onClick={() => setShowCreateDocumentModal(false)}
              className="p-1 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-3 space-y-2">
            {/* Document type buttons - golden */}
            {documentTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  console.log(`Creating ${type.id} document`);
                  // TODO: Open document input panel
                  setShowCreateDocumentModal(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded bg-gold/20 border border-gold/40 hover:bg-gold/30 hover:border-gold text-gold transition-all group font-mono text-xs uppercase tracking-wider"
              >
                <span>{type.label}</span>
                <Plus
                  size={12}
                  className="opacity-60 group-hover:opacity-100 transition-opacity"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

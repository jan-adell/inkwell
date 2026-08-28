import { X, Plus } from "lucide-react";
import { useAppStore } from "../store/appStore";

export function CreateEntityModal() {
  const { showCreateEntityModal, setShowCreateEntityModal } = useAppStore();

  if (!showCreateEntityModal) {
    return null;
  }

  const entityTypes = [
    { id: "character", label: "Personaje", icon: "👤" },
    { id: "location", label: "Localización", icon: "📍" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setShowCreateEntityModal(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="bg-ink-deep border border-ink-border rounded-lg shadow-2xl w-96 pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-border">
            <h2 className="text-lg font-display text-gold tracking-wide">
              Entidad Nueva
            </h2>
            <button
              onClick={() => setShowCreateEntityModal(false)}
              className="p-1 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-3">
            {entityTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  console.log(`Creating ${type.id} entity`);
                  setShowCreateEntityModal(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded border border-ink-border bg-ink-surface hover:bg-ink-muted hover:border-gold/40 text-ivory-dim hover:text-ivory transition-all group"
              >
                <span className="text-xl">{type.icon}</span>
                <span className="flex-1 text-left text-sm font-mono uppercase tracking-wider">
                  {type.label}
                </span>
                <Plus
                  size={14}
                  className="text-gold opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

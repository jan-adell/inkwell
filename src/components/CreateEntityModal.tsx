import { X, Plus } from "lucide-react";
import { useAppStore } from "../store/appStore";

export function CreateEntityModal() {
  const { showCreateEntityModal, setShowCreateEntityModal } = useAppStore();

  if (!showCreateEntityModal) {
    return null;
  }

  const entityTypes = [
    { id: "character", label: "Character", icon: "👤" },
    { id: "location", label: "Location", icon: "📍" },
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
              Nueva Entidad
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
            {/* Main "New Entity" button */}
            <button
              onClick={() => {
                console.log("Creating generic entity");
                setShowCreateEntityModal(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded bg-gold text-ink-void hover:bg-gold-bright transition-all font-mono text-sm uppercase tracking-wider font-bold"
            >
              <Plus size={14} />
              New Entity
            </button>

            {/* Divider */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ink-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-ink-deep text-ivory-ghost">or select type</span>
              </div>
            </div>

            {/* Entity type buttons */}
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

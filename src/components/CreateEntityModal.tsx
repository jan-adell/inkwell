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
        className="fixed inset-0 z-40"
        onClick={() => setShowCreateEntityModal(false)}
      />

      {/* Popover Bubble */}
      <div className="fixed z-50 pointer-events-none">
        <div className="pointer-events-auto bg-ink-deep border border-ink-border rounded-lg shadow-2xl w-72">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-border">
            <h2 className="text-sm font-display text-gold tracking-wide">
              Nueva Entidad
            </h2>
            <button
              onClick={() => setShowCreateEntityModal(false)}
              className="p-1 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-3 space-y-2">
            {/* Entity type buttons */}
            {entityTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  console.log(`Creating ${type.id} entity`);
                  setShowCreateEntityModal(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded border border-ink-border bg-ink-surface hover:bg-ink-muted hover:border-gold/40 text-ivory-dim hover:text-ivory transition-all group"
              >
                <span className="text-lg">{type.icon}</span>
                <span className="flex-1 text-left text-xs font-mono uppercase tracking-wider">
                  {type.label}
                </span>
                <Plus
                  size={12}
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

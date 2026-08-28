import { X, Plus, ChevronRight } from "lucide-react";
import { useAppStore } from "../store/appStore";

export function CreateEntityModal() {
  const { showCreateEntityModal, setShowCreateEntityModal } = useAppStore();

  if (!showCreateEntityModal) {
    return null;
  }

  const entityTypes = [
    { id: "character", label: "Character" },
    { id: "location", label: "Location" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setShowCreateEntityModal(false)}
      />

      {/* Popover Bubble - positioned to the right with arrow pointer */}
      <div className="fixed z-50 pointer-events-none" style={{ left: "250px", top: "100px" }}>
        <div className="pointer-events-auto bg-ink-deep border border-ink-border rounded-lg shadow-2xl w-72 relative">
          {/* Arrow pointer to the left */}
          <div className="absolute -left-2 top-6 w-2 h-2 bg-ink-deep border-l border-t border-ink-border transform rotate-45" />

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
            {/* Main New Entity button */}
            <button
              onClick={() => {
                console.log("Creating generic entity");
                setShowCreateEntityModal(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded bg-gold hover:bg-gold-bright text-ink-void transition-all group font-mono text-xs uppercase tracking-wider font-bold"
            >
              <span className="flex items-center gap-2">
                <Plus size={12} />
                New Entity
              </span>
              <ChevronRight size={12} />
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

            {/* Entity type buttons - golden */}
            {entityTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  console.log(`Creating ${type.id} entity`);
                  setShowCreateEntityModal(false);
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

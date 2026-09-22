import { useEffect, useRef } from "react";
import type React from "react";
import { Trash2 } from "lucide-react";

interface Props {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, description, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-ink-deep border border-ink-border rounded-xl shadow-2xl w-80 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-crimson/15 flex items-center justify-center">
            <Trash2 size={15} className="text-crimson" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ivory mb-1">{title}</h2>
            <p className="text-xs text-ivory-dim leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs text-ivory-dim hover:text-ivory hover:bg-ink-muted border border-ink-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-xs font-medium bg-crimson/80 hover:bg-crimson text-white border border-crimson/60 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

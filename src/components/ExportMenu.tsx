import { useState } from "react";
import { Download } from "lucide-react";

export interface ExportOption<T extends string = string> {
  id: T;
  label: string;
}

const DEFAULT_BUTTON_CLASS =
  "p-1.5 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted disabled:opacity-30";

export function ExportMenu<T extends string>({
  options,
  onSelect,
  disabled,
  title = "Export",
  buttonClassName = DEFAULT_BUTTON_CLASS,
}: {
  options: ExportOption<T>[];
  onSelect: (id: T) => void;
  disabled?: boolean;
  title?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((value) => !value)} disabled={disabled} title={title} className={buttonClassName}>
        <Download size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-ink-deep border border-ink-border rounded shadow-lg py-1">
            {options.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => {
                  setOpen(false);
                  onSelect(id);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-ivory-ghost hover:text-ivory hover:bg-ink-muted font-mono"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

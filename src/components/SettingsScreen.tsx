import { useState } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { StatisticsPanel } from "./StatisticsPanel";

type SettingsSection = "statistics";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "statistics", label: "Statistics" },
];

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("statistics");

  return (
    <div className="flex flex-1 min-h-0 bg-ink-void">
      <aside className="w-56 flex-shrink-0 bg-ink-deep border-r border-ink-border flex flex-col">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 text-xs text-ivory-ghost hover:text-ivory transition-colors"
        >
          <ArrowLeft size={12} />
          Back
        </button>
        <nav className="flex flex-col px-2">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              aria-current={activeSection === section.id}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition-colors ${
                activeSection === section.id
                  ? "bg-ink-muted text-gold"
                  : "text-ivory-ghost hover:text-ivory hover:bg-ink-muted"
              }`}
            >
              <BarChart3 size={14} />
              {section.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        {activeSection === "statistics" && <StatisticsPanel />}
      </main>
    </div>
  );
}

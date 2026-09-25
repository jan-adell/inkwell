import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { invokeGetProjectStats } from "../hooks/useTauri";
import type { ProjectStats } from "../types/core";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-surface border border-ink-border rounded p-4">
      <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-display text-gold">{value}</p>
    </div>
  );
}

export function StatisticsPanel() {
  const { projectId } = useAppStore();
  const [stats, setStats] = useState<ProjectStats | null>(null);

  useEffect(() => {
    if (!projectId) return;
    invokeGetProjectStats(projectId).then(setStats);
  }, [projectId]);

  if (!stats) {
    return <p className="text-xs text-ivory-ghost">Loading statistics…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Entities" value={stats.entity_count} />
        <StatTile label="Documents" value={stats.document_count} />
        <StatTile label="Total words" value={stats.total_word_count} />
      </div>
      <div>
        <p className="text-xs text-ivory-ghost uppercase tracking-wider mb-2">Words per document</p>
        {stats.documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText size={24} className="text-ivory-ghost opacity-30 mb-2" />
            <p className="text-xs text-ivory-ghost">No documents yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {stats.documents.map((document) => (
              <div key={document.id} className="flex justify-between items-center py-2 border-b border-ink-border">
                <span className="text-sm text-ivory-dim truncate">{document.title}</span>
                <span className="text-xs text-ivory-ghost font-mono">{document.word_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

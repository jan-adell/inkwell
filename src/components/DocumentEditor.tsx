import { useCallback, useEffect, useRef, useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { invokeReadDocumentContent, invokeWriteDocumentContent } from "../hooks/useTauri";

const AUTOSAVE_DELAY_MS = 1000;
const EMPTY_DOC = '{"type":"doc","content":[]}';

type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  documentId: string;
  title: string;
  wordCount: number;
}

export function DocumentEditor({ documentId, title, wordCount }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pendingSave = useRef<{ json: string; text: string } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDocId = useRef(documentId);

  useEffect(() => {
    currentDocId.current = documentId;
    setContent(null);
    setSaveState("idle");
    invokeReadDocumentContent(documentId)
      .then((json) => {
        if (currentDocId.current === documentId) {
          setContent(json || EMPTY_DOC);
        }
      })
      .catch(() => {
        if (currentDocId.current === documentId) setContent(EMPTY_DOC);
      });
  }, [documentId]);

  async function flushSave(docId: string, json: string, text: string) {
    setSaveState("saving");
    try {
      await invokeWriteDocumentContent(docId, json, text);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  const handleChange = useCallback(
    (json: string, text: string) => {
      pendingSave.current = { json, text };
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const snap = pendingSave.current;
        if (snap) {
          pendingSave.current = null;
          flushSave(currentDocId.current, snap.json, snap.text);
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const snap = pendingSave.current;
      if (snap) {
        pendingSave.current = null;
        invokeWriteDocumentContent(currentDocId.current, snap.json, snap.text).catch(() => {});
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-ink-border flex-shrink-0">
        <h1 className="text-lg font-display text-ivory tracking-wide truncate">{title}</h1>
        <span className="text-xs text-ivory-ghost font-mono flex-shrink-0 ml-4">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && "Save failed"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto h-full">
          {content === null ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-4 bg-ink-surface rounded"
                  style={{ width: `${70 + (i % 3) * 10}%` }}
                />
              ))}
            </div>
          ) : (
            <RichTextEditor
              mode="prose"
              value={content}
              onChange={handleChange}
              placeholder="Start writing…"
            />
          )}
        </div>
      </div>

      <div className="px-8 py-2 border-t border-ink-border flex-shrink-0">
        <span className="text-xs text-ivory-ghost font-mono">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
      </div>
    </div>
  );
}

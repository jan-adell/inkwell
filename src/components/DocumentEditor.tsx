import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Heading1, Heading2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { RichTextEditor } from "./RichTextEditor";
import {
  invokeReadDocumentContent,
  invokeUpdateDocument,
  invokeWriteDocumentContent,
} from "../hooks/useTauri";
import { useAppStore } from "../store/appStore";

const AUTOSAVE_DELAY_MS = 1000;
const EMPTY_DOC = '{"type":"doc","content":[]}';

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editor: Editor | null;
}

function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, label: string, Icon: React.ElementType) => (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={label}
      className={[
        "p-1.5 rounded transition-colors",
        active
          ? "bg-gold/20 text-gold"
          : "text-ivory-ghost hover:text-ivory hover:bg-ink-muted",
      ].join(" ")}
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-ink-border flex-shrink-0">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold", Bold)}
      {btn(
        editor.isActive("italic"),
        () => editor.chain().focus().toggleItalic().run(),
        "Italic",
        Italic,
      )}
      <div className="w-px h-4 bg-ink-border mx-1" />
      {btn(
        editor.isActive("heading", { level: 1 }),
        () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        "Chapter title",
        Heading1,
      )}
      {btn(
        editor.isActive("heading", { level: 2 }),
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        "Scene break",
        Heading2,
      )}
    </div>
  );
}

// ── DocumentEditor ────────────────────────────────────────────────────────────

interface Props {
  documentId: string;
  title: string;
  wordCount: number;
}

export function DocumentEditor({ documentId, title, wordCount }: Props) {
  const { updateDocument } = useAppStore();
  const [content, setContent] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState(title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const pendingSave = useRef<{ json: string; text: string } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDocId = useRef(documentId);

  useEffect(() => {
    currentDocId.current = documentId;
    setContent(null);
    setLocalTitle(title);
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

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

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

  const handleChange = useCallback((json: string, text: string) => {
    pendingSave.current = { json, text };
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const snap = pendingSave.current;
      if (snap) {
        pendingSave.current = null;
        flushSave(currentDocId.current, snap.json, snap.text);
      }
    }, AUTOSAVE_DELAY_MS);
  }, []);

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

  async function handleTitleBlur() {
    const trimmed = localTitle.trim() || "Untitled";
    if (trimmed === title) return;
    try {
      const updated = await invokeUpdateDocument(documentId, { title: trimmed });
      updateDocument(updated);
    } catch {
      setLocalTitle(title);
    }
  }

  function handleTitleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setLocalTitle(title);
      e.currentTarget.blur();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-ink-border flex-shrink-0">
        <input
          type="text"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKey}
          className="
            flex-1 bg-transparent text-base font-display text-ivory tracking-wide
            focus:outline-none selectable
            placeholder:text-ivory-ghost
          "
          placeholder="Untitled"
        />
        <span className="text-xs text-ivory-ghost font-mono flex-shrink-0 ml-4 w-16 text-right">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && "Save failed"}
        </span>
      </div>

      {/* Formatting toolbar */}
      <Toolbar editor={editorInstance} />

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        <div className="max-w-2xl mx-auto h-full">
          {content === null ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-3.5 bg-ink-surface rounded"
                  style={{ width: `${70 + (i % 3) * 10}%` }}
                />
              ))}
            </div>
          ) : (
            <RichTextEditor
              mode="prose"
              value={content}
              onChange={handleChange}
              onEditorReady={setEditorInstance}
              placeholder="Start writing…"
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-1.5 border-t border-ink-border flex-shrink-0">
        <span className="text-xs text-ivory-ghost font-mono">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
      </div>
    </div>
  );
}

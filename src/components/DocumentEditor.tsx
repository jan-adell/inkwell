import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Heading1, Heading2, ZoomIn, ZoomOut } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { RichTextEditor } from "./RichTextEditor";
import {
  invokeReadDocumentContent,
  invokeUpdateDocument,
  invokeWriteDocumentContent,
} from "../hooks/useTauri";
import { useAppStore } from "../store/appStore";
import type { Document } from "../types/core";

const AUTOSAVE_DELAY_MS = 1000;
const EMPTY_DOC = '{"type":"doc","content":[]}';
const FONT_SIZE_KEY = "inkwell:editor-font-size";
const FONT_SIZES = [0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5];
const DEFAULT_FONT_SIZE = 1;

const STATUS_LABELS: Record<Document["status"], string> = {
  idea: "Idea",
  draft: "Draft",
  revision: "Revision",
  final: "Final",
};

const STATUS_COLORS: Record<Document["status"], string> = {
  idea: "text-ivory-ghost",
  draft: "text-gold/80",
  revision: "text-amber-400",
  final: "text-emerald-400",
};

function loadFontSize(): number {
  try {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    const parsed = stored ? parseFloat(stored) : NaN;
    return FONT_SIZES.includes(parsed) ? parsed : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

function saveFontSize(size: number) {
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(size));
  } catch {}
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editor: Editor | null;
  fontSize: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

function Toolbar({ editor, fontSize, onZoomIn, onZoomOut, canZoomIn, canZoomOut }: ToolbarProps) {
  const marks = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor?.isActive("bold") ?? false,
      italic: ctx.editor?.isActive("italic") ?? false,
      h1: ctx.editor?.isActive("heading", { level: 1 }) ?? false,
      h2: ctx.editor?.isActive("heading", { level: 2 }) ?? false,
    }),
  });

  const fmtBtn = (active: boolean, onClick: () => void, label: string, Icon: React.ElementType) => (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={label}
      className={[
        "p-1.5 rounded transition-colors",
        active ? "bg-gold/20 text-gold" : "text-ivory-ghost hover:text-ivory hover:bg-ink-muted",
      ].join(" ")}
    >
      <Icon size={14} />
    </button>
  );

  const zoomBtn = (onClick: () => void, label: string, Icon: React.ElementType, enabled: boolean) => (
    <button
      onClick={onClick}
      disabled={!enabled}
      title={label}
      className="p-1.5 rounded transition-colors text-ivory-ghost hover:text-ivory hover:bg-ink-muted disabled:opacity-30 disabled:cursor-default"
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-ink-border flex-shrink-0">
      {editor && marks && (
        <>
          {fmtBtn(marks.bold, () => editor.chain().focus().toggleBold().run(), "Bold", Bold)}
          {fmtBtn(marks.italic, () => editor.chain().focus().toggleItalic().run(), "Italic", Italic)}
          <div className="w-px h-4 bg-ink-border mx-1" />
          {fmtBtn(marks.h1, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "Chapter title", Heading1)}
          {fmtBtn(marks.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Scene break", Heading2)}
        </>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {zoomBtn(onZoomOut, "Smaller text", ZoomOut, canZoomOut)}
        <span className="text-xs text-ivory-ghost font-mono w-9 text-center tabular-nums">
          {Math.round(fontSize * 100)}%
        </span>
        {zoomBtn(onZoomIn, "Larger text", ZoomIn, canZoomIn)}
      </div>
    </div>
  );
}

// ── DocumentEditor ────────────────────────────────────────────────────────────

interface Props {
  documentId: string;
  doc: Document;
}

export function DocumentEditor({ documentId, doc }: Props) {
  const { updateDocument } = useAppStore();
  const [content, setContent] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [fontSize, setFontSize] = useState<number>(loadFontSize);

  const currentIdx = FONT_SIZES.indexOf(fontSize);
  const canZoomIn = currentIdx < FONT_SIZES.length - 1;
  const canZoomOut = currentIdx > 0;

  function zoomIn() {
    if (!canZoomIn) return;
    const next = FONT_SIZES[currentIdx + 1];
    setFontSize(next);
    saveFontSize(next);
  }

  function zoomOut() {
    if (!canZoomOut) return;
    const next = FONT_SIZES[currentIdx - 1];
    setFontSize(next);
    saveFontSize(next);
  }

  const pendingSave = useRef<{ json: string; text: string } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDocId = useRef(documentId);

  useEffect(() => {
    currentDocId.current = documentId;
    setContent(null);
    setLocalTitle(doc.title);
    setSaveState("idle");
    invokeReadDocumentContent(documentId)
      .then((json) => {
        if (currentDocId.current === documentId) setContent(json || EMPTY_DOC);
      })
      .catch(() => {
        if (currentDocId.current === documentId) setContent(EMPTY_DOC);
      });
  }, [documentId]);

  useEffect(() => {
    setLocalTitle(doc.title);
  }, [doc.title]);

  async function flushSave(docId: string, json: string, text: string) {
    setSaveState("saving");
    try {
      const updated = await invokeWriteDocumentContent(docId, json, text);
      updateDocument(updated);
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
        invokeWriteDocumentContent(currentDocId.current, snap.json, snap.text)
          .then(updateDocument)
          .catch(() => {});
      }
    };
  }, []);

  async function handleTitleBlur() {
    const trimmed = localTitle.trim() || "Untitled";
    if (trimmed === doc.title) return;
    try {
      const updated = await invokeUpdateDocument(documentId, { title: trimmed });
      updateDocument(updated);
    } catch {
      setLocalTitle(doc.title);
    }
  }

  function handleTitleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setLocalTitle(doc.title);
      e.currentTarget.blur();
    }
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as Document["status"];
    try {
      const updated = await invokeUpdateDocument(documentId, { status });
      updateDocument(updated);
    } catch {}
  }

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-8 py-3 border-b border-ink-border flex-shrink-0">
        <input
          type="text"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKey}
          className="flex-1 bg-transparent text-base font-display text-ivory tracking-wide focus:outline-none selectable placeholder:text-ivory-ghost"
          placeholder="Untitled"
        />
        <select
          value={doc.status}
          onChange={handleStatusChange}
          className={[
            "bg-transparent border-none text-xs font-mono focus:outline-none cursor-pointer flex-shrink-0",
            STATUS_COLORS[doc.status],
          ].join(" ")}
        >
          {(Object.keys(STATUS_LABELS) as Document["status"][]).map((s) => (
            <option key={s} value={s} className="bg-ink-deep text-ivory">
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="text-xs text-ivory-ghost font-mono flex-shrink-0 w-16 text-right">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && "Save failed"}
        </span>
      </div>

      {/* Formatting toolbar */}
      <Toolbar
        editor={editorInstance}
        fontSize={fontSize}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
      />

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 py-4" style={{ fontSize: `${fontSize}rem` }}>
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
      <div className="px-8 py-1.5 border-t border-ink-border flex-shrink-0 flex items-center gap-4">
        <span className="text-xs text-ivory-ghost font-mono">
          {doc.word_count} {doc.word_count === 1 ? "word" : "words"}
        </span>
        <span className="text-xs text-ivory-ghost font-mono">
          Created {fmtDate(doc.created_at)}
        </span>
        <span className="text-xs text-ivory-ghost font-mono">
          Modified {fmtDateTime(doc.updated_at)}
        </span>
      </div>
    </div>
  );
}

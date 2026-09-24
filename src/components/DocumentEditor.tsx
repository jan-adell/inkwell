import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Heading1, Heading2, ZoomIn, ZoomOut, Download } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { RichTextEditor } from "./RichTextEditor";
import {
  invokeExportBook,
  invokeReadDocumentContent,
  invokeUpdateDocument,
  invokeWriteDocumentContent,
  type ExportFormat,
} from "../hooks/useTauri";
import { useAppStore } from "../store/appStore";
import type { Document } from "../types/core";

const EXPORT_FORMATS: { format: ExportFormat; label: string; filterName: string }[] = [
  { format: "txt", label: "Plain Text (.txt)", filterName: "Plain Text" },
  { format: "pdf", label: "PDF (.pdf)", filterName: "PDF Document" },
  { format: "epub", label: "EPUB (.epub)", filterName: "EPUB Book" },
];

const AUTOSAVE_DELAY_MS = 1000;
const EMPTY_DOC = '{"type":"doc","content":[]}';
const PAGE_SIZES = {
  A5: { width: "148mm", height: "210mm" },
  A4: { width: "210mm", height: "297mm" },
  A3: { width: "297mm", height: "420mm" },
  unlimited: { width: "210mm", height: "auto" },
} as const;
type PageSize = keyof typeof PAGE_SIZES;
const PAGE_MARGIN = "33mm 47mm 66mm 23mm";
const ZOOM_KEY = "inkwell:editor-zoom";
const ZOOM_LEVELS = [0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2];
const STATUS_LABELS: Record<Document["status"], string> = { idea: "Idea", draft: "Draft", revision: "Revision", final: "Final" };
const STATUS_COLORS: Record<Document["status"], string> = { idea: "text-ivory-ghost", draft: "text-gold/80", revision: "text-amber-400", final: "text-emerald-400" };
function loadZoom() { try { const value = parseFloat(localStorage.getItem(ZOOM_KEY) ?? ""); return ZOOM_LEVELS.includes(value) ? value : 1; } catch { return 1; } }
function saveZoom(value: number) { try { localStorage.setItem(ZOOM_KEY, String(value)); } catch {} }
function fmtDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function fmtDateTime(value: string) { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
type SaveState = "idle" | "saving" | "saved" | "error";

export function ExportMenu({ onExport, exportingFormat }: { onExport: (format: ExportFormat) => void; exportingFormat: ExportFormat | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((value) => !value)} disabled={exportingFormat !== null} title="Export book" className="p-1.5 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted disabled:opacity-30">
        <Download size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-ink-deep border border-ink-border rounded shadow-lg py-1">
            {EXPORT_FORMATS.map(({ format, label }) => (
              <button
                key={format}
                onClick={() => { setOpen(false); onExport(format); }}
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

function Toolbar({ editor, zoom, onZoomIn, onZoomOut, canZoomIn, canZoomOut, pageSize, onPageSizeChange, onExport, exportingFormat }: { editor: Editor | null; zoom: number; onZoomIn: () => void; onZoomOut: () => void; canZoomIn: boolean; canZoomOut: boolean; pageSize: PageSize; onPageSizeChange: (size: PageSize) => void; onExport: (format: ExportFormat) => void; exportingFormat: ExportFormat | null }) {
  const marks = useEditorState({ editor, selector: (ctx) => ({ bold: ctx.editor?.isActive("bold") ?? false, italic: ctx.editor?.isActive("italic") ?? false, h1: ctx.editor?.isActive("heading", { level: 1 }) ?? false, h2: ctx.editor?.isActive("heading", { level: 2 }) ?? false }) });
  const button = (active: boolean, action: () => void, label: string, Icon: React.ElementType) => <button onMouseDown={(event) => { event.preventDefault(); action(); }} title={label} className={`p-1.5 rounded transition-colors ${active ? "bg-gold/20 text-gold" : "text-ivory-ghost hover:text-ivory hover:bg-ink-muted"}`}><Icon size={14} /></button>;
  const zoomButton = (action: () => void, label: string, Icon: React.ElementType, enabled: boolean) => <button onClick={action} disabled={!enabled} title={label} className="p-1.5 rounded text-ivory-ghost hover:text-ivory hover:bg-ink-muted disabled:opacity-30"><Icon size={14} /></button>;
  return <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-ink-border flex-shrink-0">{editor && marks && <>{button(marks.bold, () => editor.chain().focus().toggleBold().run(), "Bold", Bold)}{button(marks.italic, () => editor.chain().focus().toggleItalic().run(), "Italic", Italic)}<div className="w-px h-4 bg-ink-border mx-1" />{button(marks.h1, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "Chapter title", Heading1)}{button(marks.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Scene break", Heading2)}</>}<label className="ml-3 flex items-center gap-2 text-xs text-ivory-ghost font-mono">Page <select value={pageSize} onChange={(event) => onPageSizeChange(event.target.value as PageSize)} className="bg-ink-surface border border-ink-border rounded px-1.5 py-1 text-xs text-ivory focus:outline-none"><option value="A5">A5</option><option value="A4">A4</option><option value="A3">A3</option><option value="unlimited">Unlimited</option></select></label><div className="ml-auto flex items-center gap-0.5">{zoomButton(onZoomOut, "Zoom out", ZoomOut, canZoomOut)}<span className="text-xs text-ivory-ghost font-mono w-9 text-center">{Math.round(zoom * 100)}%</span>{zoomButton(onZoomIn, "Zoom in", ZoomIn, canZoomIn)}<div className="w-px h-4 bg-ink-border mx-1" /><ExportMenu onExport={onExport} exportingFormat={exportingFormat} /></div></div>;
}

export function DocumentEditor({ documentId, doc }: { documentId: string; doc: Document }) {
  const { updateDocument, projectId, knownProjects } = useAppStore();
  const [content, setContent] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [zoom, setZoom] = useState(loadZoom);
  const [pagePx, setPagePx] = useState({ w: 0, h: 0 });
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const pendingSave = useRef<{ json: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDocId = useRef(documentId);
  const size = PAGE_SIZES[pageSize];
  const zoomIndex = ZOOM_LEVELS.indexOf(zoom);
  const handleChange = useCallback((json: string, text: string) => { pendingSave.current = { json, text }; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { const value = pendingSave.current; if (value) { pendingSave.current = null; void flushSave(currentDocId.current, value.json, value.text); } }, AUTOSAVE_DELAY_MS); }, []);
  async function flushSave(id: string, json: string, text: string) { setSaveState("saving"); try { updateDocument(await invokeWriteDocumentContent(id, json, text)); setSaveState("saved"); setTimeout(() => setSaveState("idle"), 2000); } catch { setSaveState("error"); } }
  useEffect(() => { const element = pageRef.current; if (!element) return; const observer = new ResizeObserver(() => setPagePx({ w: element.offsetWidth, h: element.offsetHeight })); observer.observe(element); return () => observer.disconnect(); }, []);
  useEffect(() => { currentDocId.current = documentId; setContent(null); setLocalTitle(doc.title); void invokeReadDocumentContent(documentId).then((value) => { if (currentDocId.current === documentId) setContent(value || EMPTY_DOC); }).catch(() => setContent(EMPTY_DOC)); }, [documentId, doc.title]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); const value = pendingSave.current; if (value) void invokeWriteDocumentContent(currentDocId.current, value.json, value.text); }, []);
  async function handleTitleBlur() { const title = localTitle.trim() || "Untitled"; if (title !== doc.title) { try { updateDocument(await invokeUpdateDocument(documentId, { title })); } catch { setLocalTitle(doc.title); } } }
  async function handleStatusChange(event: React.ChangeEvent<HTMLSelectElement>) { try { updateDocument(await invokeUpdateDocument(documentId, { status: event.target.value })); } catch {} }
  async function handleExport(format: ExportFormat) {
    if (!projectId) return;
    const project = knownProjects.find((p) => p.project_id === projectId);
    const config = EXPORT_FORMATS.find((f) => f.format === format);
    const dest = await save({
      defaultPath: `${project?.name ?? "Book"}.${format}`,
      filters: [{ name: config?.filterName ?? format, extensions: [format] }],
    });
    if (!dest) return;
    setExportingFormat(format);
    setExportError(null);
    try {
      await invokeExportBook(projectId, format, dest);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : typeof e === "string" ? e : "Export failed.");
    } finally {
      setExportingFormat(null);
    }
  }
  const gap = 48;
  const wrapperHeight = pagePx.h > 0 && pageSize !== "unlimited" ? pagePx.h * zoom + gap * 2 : "100%";
  const wrapperWidth = pagePx.w > 0 ? pagePx.w * zoom + gap * 2 : "100%";
  return <div className="flex flex-col h-full"><div className="flex items-center gap-3 px-6 py-2.5 border-b border-ink-border flex-shrink-0"><input type="text" value={localTitle} onChange={(event) => setLocalTitle(event.target.value)} onBlur={handleTitleBlur} className="flex-1 bg-transparent text-sm font-display text-ivory tracking-wide focus:outline-none selectable" placeholder="Untitled" /><select value={doc.status} onChange={handleStatusChange} className={`bg-transparent border-none text-xs font-mono focus:outline-none cursor-pointer flex-shrink-0 ${STATUS_COLORS[doc.status]}`}>{(Object.keys(STATUS_LABELS) as Document["status"][]).map((status) => <option key={status} value={status} className="bg-ink-deep text-ivory">{STATUS_LABELS[status]}</option>)}</select><span className="text-xs text-ivory-ghost font-mono w-16 text-right">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}</span>{(exportingFormat || exportError) && <span className="text-xs font-mono text-right" style={{ color: exportError ? "#f87171" : undefined }}>{exportingFormat ? "Exporting…" : exportError}</span>}</div><Toolbar editor={editorInstance} zoom={zoom} onZoomIn={() => { if (zoomIndex < ZOOM_LEVELS.length - 1) { const value = ZOOM_LEVELS[zoomIndex + 1]; setZoom(value); saveZoom(value); } }} onZoomOut={() => { if (zoomIndex > 0) { const value = ZOOM_LEVELS[zoomIndex - 1]; setZoom(value); saveZoom(value); } }} canZoomIn={zoomIndex < ZOOM_LEVELS.length - 1} canZoomOut={zoomIndex > 0} pageSize={pageSize} onPageSizeChange={setPageSize} onExport={handleExport} exportingFormat={exportingFormat} /><div className="flex-1 overflow-auto bg-[#111118]"><div style={{ minHeight: wrapperHeight, minWidth: wrapperWidth }} className="relative flex justify-center"><div ref={pageRef} className={`page-sheet page-size-${pageSize}`} style={{ width: size.width, minHeight: size.height === "auto" ? "calc(100vh - 180px)" : size.height, transform: `scale(${zoom})`, transformOrigin: "top center", position: "absolute", top: gap, padding: PAGE_MARGIN }}><div className="page-sheet-content">{content === null ? <div className="space-y-2.5 animate-pulse">{[...Array(7)].map((_, index) => <div key={index} className="h-3 bg-ink-surface rounded" style={{ width: `${60 + (index % 4) * 10}%` }} />)}</div> : <RichTextEditor mode="prose" value={content} onChange={handleChange} onEditorReady={setEditorInstance} placeholder="Start writing…" />}</div></div></div></div><div className="px-6 py-1.5 border-t border-ink-border flex-shrink-0 flex items-center gap-4"><span className="text-xs text-ivory-ghost font-mono">{doc.word_count} {doc.word_count === 1 ? "word" : "words"}</span><span className="text-xs text-ivory-ghost font-mono">Created {fmtDate(doc.created_at)}</span><span className="text-xs text-ivory-ghost font-mono">Modified {fmtDateTime(doc.updated_at)}</span></div></div>;
}

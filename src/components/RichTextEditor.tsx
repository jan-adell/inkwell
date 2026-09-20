import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface Props {
  mode: "prose" | "notes";
  value: string;
  onChange: (json: string, text: string) => void;
  onEditorReady?: (editor: Editor | null) => void;
  placeholder?: string;
  className?: string;
}

const EMPTY_DOC = '{"type":"doc","content":[]}';

function buildExtensions(mode: "prose" | "notes") {
  return [
    StarterKit.configure({
      heading: mode === "prose" ? { levels: [1, 2] } : false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
      strike: false,
    }),
  ];
}

function getPlainText(editor: Editor | null): string {
  return editor?.getText() ?? "";
}

export function RichTextEditor({ mode, value, onChange, onEditorReady, placeholder, className }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;

  const editor = useEditor({
    extensions: buildExtensions(mode),
    content: value && value !== EMPTY_DOC ? JSON.parse(value) : undefined,
    editable: true,
    editorProps: {
      attributes: {
        class: [
          "prose-editor outline-none min-h-full",
          mode === "prose" ? "prose-prose" : "prose-notes",
        ].join(" "),
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
        contenteditable: "true",
        spellcheck: "true",
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current(JSON.stringify(editor.getJSON()), getPlainText(editor));
    },
  });

  // TipTap can finish creating the editor after the first React render. Notify
  // the parent from an effect so the toolbar gets the instance consistently in
  // both Linux WebKit and Windows WebView2.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(true);
    onEditorReadyRef.current?.(editor);

    return () => {
      onEditorReadyRef.current?.(null);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(true);
    const current = JSON.stringify(editor.getJSON());
    const incoming = value || EMPTY_DOC;
    if (current !== incoming) {
      try {
        editor.commands.setContent(incoming ? JSON.parse(incoming) : null, { emitUpdate: false });
      } catch {
        editor.commands.setContent(null, { emitUpdate: false });
      }
    }
  }, [value, editor]);

  return (
    <div
      className={`${className ?? "h-full"} prose-editor-container`}
      onMouseDown={() => editor?.commands.focus()}
      onClick={() => editor?.commands.focus()}
    >
      <EditorContent editor={editor} className="h-full" />
    </div>
  );
}

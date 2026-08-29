import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface Props {
  mode: "prose" | "notes";
  value: string;
  onChange: (json: string, text: string) => void;
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

function getPlainText(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return "";
  return editor.getText();
}

export function RichTextEditor({ mode, value, onChange, placeholder, className }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: buildExtensions(mode),
    content: value && value !== EMPTY_DOC ? JSON.parse(value) : undefined,
    editorProps: {
      attributes: {
        class: [
          "prose-editor outline-none min-h-full",
          mode === "prose" ? "prose-prose" : "prose-notes",
        ].join(" "),
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate({ editor }) {
      const json = JSON.stringify(editor.getJSON());
      const text = getPlainText(editor);
      onChangeRef.current(json, text);
    },
  });

  useEffect(() => {
    if (!editor) return;
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
    <div className={className ?? "h-full"}>
      <EditorContent editor={editor} className="h-full" />
    </div>
  );
}

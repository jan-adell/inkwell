import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useAppStore } from "../store/appStore";

export const ENTITY_HIGHLIGHT_KEY = new PluginKey<DecorationSet>("entityHighlight");

function getAllEntities() {
  const state = useAppStore.getState();
  return [
    ...state.rootEntities,
    ...Object.values(state.entitiesByFolder).flat(),
  ].filter(e => e.name.trim().length >= 2);
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const entities = getAllEntities();
  if (entities.length === 0) return DecorationSet.empty;

  entities.sort((a, b) => b.name.length - a.name.length);

  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;

    for (const entity of entities) {
      const escaped = entity.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const from = pos + match.index;
        const to = from + match[0].length;
        decorations.push(
          Decoration.inline(from, to, {
            nodeName: "span",
            class: "entity-link",
            "data-entity-id": entity.id,
            title: entity.name,
          })
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const EntityHighlightExtension = Extension.create({
  name: "entityHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ENTITY_HIGHLIGHT_KEY,

        state: {
          init(_, state) {
            return buildDecorations(state.doc);
          },
          apply(tr, old) {
            if (tr.docChanged || tr.getMeta(ENTITY_HIGHLIGHT_KEY) === "refresh") {
              return buildDecorations(tr.doc);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },

        props: {
          decorations(state) {
            return ENTITY_HIGHLIGHT_KEY.getState(state);
          },
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            const entityId =
              target.dataset.entityId ??
              target.closest<HTMLElement>("[data-entity-id]")?.dataset.entityId;
            if (entityId) {
              useAppStore.getState().setSelectedEntityId(entityId);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

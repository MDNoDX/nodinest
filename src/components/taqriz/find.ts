import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Find (and replace) inside one taqriz. Matching ignores case and the
 * Uzbek apostrophe variants (o‘ o' oʻ, g‘ …), so "o'zbek" finds "o‘zbek".
 */
type FindState = { query: string; matches: { from: number; to: number }[]; index: number };
export const findKey = new PluginKey<FindState>("nn-find");

const APOS = /[‘’ʻʼ`´']/g;
const fold = (s: string) => s.toLocaleLowerCase().replace(APOS, "'");

/** Positions of `query` in the document (same folding as the find bar). */
export function findAll(doc: PMNode, query: string) {
  return search(doc, query);
}

function search(doc: PMNode, query: string) {
  const q = fold(query);
  const out: { from: number; to: number }[] = [];
  if (!q) return out;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Text of the block with a map from string index → document position.
    let text = "";
    const at: number[] = [];
    node.forEach((child, offset) => {
      if (!child.isText) return;
      for (let i = 0; i < child.text!.length; i++) at.push(pos + 1 + offset + i);
      text += child.text;
    });
    const hay = fold(text);
    for (let i = hay.indexOf(q); i >= 0 && out.length < 2000; i = hay.indexOf(q, i + q.length))
      out.push({ from: at[i], to: at[i + q.length - 1] + 1 });
    return false;
  });
  return out;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    find: {
      setFind: (query: string) => ReturnType;
      findStep: (dir: 1 | -1) => ReturnType;
      /** Puts the cursor after the current match (when the find bar closes). */
      findFocusCurrent: () => ReturnType;
      replaceCurrent: (text: string) => ReturnType;
      replaceAll: (text: string) => ReturnType;
    };
  }
}

export const Find = Extension.create({
  name: "find",
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: "", matches: [], index: 0 }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
            if (!meta && !tr.docChanged) return prev;
            const query = meta?.query ?? prev.query;
            const matches = search(state.doc, query);
            let index = meta?.index ?? prev.index;
            if (meta?.query !== undefined && meta.query !== prev.query) {
              // Start from the first match after the cursor.
              const after = matches.findIndex((m) => m.from >= state.selection.from);
              index = after < 0 ? 0 : after;
            }
            return {
              query,
              matches,
              index: matches.length ? Math.min(index, matches.length - 1) : 0,
            };
          },
        },
        props: {
          decorations(state) {
            const f = findKey.getState(state);
            if (!f?.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              f.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === f.index ? "nn-find nn-find-current" : "nn-find",
                }),
              ),
            );
          },
        },
      }),
    ];
  },
  addCommands() {
    // Scroll to a match without selecting it (no formatting menu pops up).
    const reveal = (
      view: import("@tiptap/pm/view").EditorView | undefined,
      m?: { from: number },
    ) => {
      if (!view || !m) return;
      requestAnimationFrame(() => {
        const { node } = view.domAtPos(m.from);
        const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    };
    return {
      setFind:
        (query) =>
        ({ tr, state, dispatch, view }) => {
          if (!dispatch) return true;
          tr.setMeta(findKey, { query });
          const matches = search(state.doc, query);
          const after = matches.findIndex((m) => m.from >= state.selection.from);
          reveal(view, matches[after < 0 ? 0 : after]);
          return true;
        },
      findStep:
        (dir) =>
        ({ tr, state, dispatch, view }) => {
          const f = findKey.getState(state);
          if (!f?.matches.length) return false;
          const index = (f.index + dir + f.matches.length) % f.matches.length;
          if (dispatch) {
            tr.setMeta(findKey, { index });
            reveal(view, f.matches[index]);
          }
          return true;
        },
      findFocusCurrent:
        () =>
        ({ tr, state, dispatch }) => {
          const f = findKey.getState(state);
          const m = f?.matches[f.index];
          if (!m) return false;
          if (dispatch) tr.setSelection(TextSelection.create(tr.doc, m.to));
          return true;
        },
      replaceCurrent:
        (text) =>
        ({ tr, state, dispatch }) => {
          const f = findKey.getState(state);
          const m = f?.matches[f.index];
          if (!m) return false;
          if (dispatch) tr.insertText(text, m.from, m.to);
          return true;
        },
      replaceAll:
        (text) =>
        ({ tr, state, dispatch }) => {
          const f = findKey.getState(state);
          if (!f?.matches.length) return false;
          if (dispatch) for (const m of [...f.matches].reverse()) tr.insertText(text, m.from, m.to);
          return true;
        },
    };
  },
});

import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import type { WriteupDoc } from "@/lib/writeup-doc";

export type Draft = { doc: WriteupDoc; base: string | null; at: number };
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "offline" | "conflict";
export type Chapter = { pos: number; level: number; text: string };

const draftKey = (id: string) => `nn:taqriz:${id}`;
export function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
export function writeDraft(id: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(draftKey(id), JSON.stringify(d));
    else localStorage.removeItem(draftKey(id));
  } catch {
    /* storage full / blocked: the server copy still exists */
  }
}

export function chaptersOf(editor: Editor | null): Chapter[] {
  if (!editor) return [];
  const out: Chapter[] = [];
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim())
      out.push({ pos, level: node.attrs.level as number, text: node.textContent.trim() });
  });
  return out;
}

/**
 * The author's own text: a book template's guiding prompts (paragraphs that
 * are entirely italic) are not counted towards words or goals.
 */
export function authorText(doc: PMNode) {
  const parts: string[] = [];
  doc.forEach((n) => {
    if (n.type.name === "paragraph" && n.childCount > 0) {
      let allItalic = true;
      n.forEach((c) => {
        if (!c.marks.some((m) => m.type.name === "italic")) allItalic = false;
      });
      if (allItalic) return;
    }
    parts.push(n.textContent);
  });
  return parts.join(" ");
}

export const OUTLINE_KEY = "nn:taqriz-outline";
export function readOutline() {
  try {
    return localStorage.getItem(OUTLINE_KEY) === "hidden";
  } catch {
    return false;
  }
}
export function subscribeOutline(cb: () => void) {
  window.addEventListener(OUTLINE_KEY, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(OUTLINE_KEY, cb);
    window.removeEventListener("storage", cb);
  };
}

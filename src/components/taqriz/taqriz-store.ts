import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { countWords, type WriteupDoc } from "@/lib/writeup-doc";

export type Draft = { doc: WriteupDoc; base: string | null; at: number };
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "offline" | "conflict";
export type Chapter = { pos: number; level: number; text: string; words: number };

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
      out.push({ pos, level: node.attrs.level as number, text: node.textContent.trim(), words: 0 });
    else if (out.length && !isPrompt(node))
      out[out.length - 1].words += countWords(node.textContent);
  });
  return out;
}

/** A book template's guiding prompt: a paragraph that is entirely italic. */
function isPrompt(n: PMNode) {
  if (n.type.name !== "paragraph" || n.childCount === 0) return false;
  let allItalic = true;
  n.forEach((c) => {
    if (!c.marks.some((m) => m.type.name === "italic")) allItalic = false;
  });
  return allItalic;
}

/**
 * The author's own text: a book template's guiding prompts (paragraphs that
 * are entirely italic) are not counted towards words or goals.
 */
export function authorText(doc: PMNode) {
  const parts: string[] = [];
  doc.forEach((n) => {
    if (!isPrompt(n)) parts.push(n.textContent);
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

/**
 * Words written today in one book: the count at the first visit of the day is
 * kept on this device and today's words are the difference.
 */
export function todayWords(bookId: string, words: number, update = true) {
  const key = `nn:write-day:${bookId}`;
  const day = new Date().toLocaleDateString("sv");
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as { day: string; start: number }) : null;
    if (v && v.day === day) return Math.max(0, words - v.start);
    if (update) localStorage.setItem(key, JSON.stringify({ day, start: words }));
  } catch {
    /* storage unavailable */
  }
  return 0;
}

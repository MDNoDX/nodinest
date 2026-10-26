import { Mark } from "@tiptap/core";

/**
 * A passage saved to "Qaydlar" from the taqriz: highlighted in its own colour
 * and linked to the note by id (the note itself lives in Notes).
 */
export const NoteMark = Mark.create({
  name: "note",
  inclusive: false,
  excludes: "",
  addAttributes: () => ({ noteId: { default: null } }),
  parseHTML: () => [
    {
      tag: "mark[data-note-id]",
      getAttrs: (el) => ({ noteId: (el as HTMLElement).dataset.noteId }),
    },
  ],
  renderHTML: ({ mark }) => [
    "mark",
    { "data-note-id": mark.attrs.noteId, class: "taqriz-note" },
    0,
  ],
});

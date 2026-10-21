"use client";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Film, Loader2, Music, Trash2, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { transcribeAudioAction } from "@/app/actions/ai";

const fileAttrs = {
  fileId: { default: null },
  name: { default: "" },
};

/** An uploaded picture (private file). */
export const ImageNode = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => fileAttrs,
  parseHTML: () => [
    {
      tag: "img[data-file-id]",
      getAttrs: (el) => ({
        fileId: (el as HTMLElement).dataset.fileId,
        name: (el as HTMLElement).getAttribute("alt") ?? "",
      }),
    },
  ],
  renderHTML: ({ node }) => [
    "img",
    {
      src: `/api/files/${node.attrs.fileId}`,
      alt: node.attrs.name,
      "data-file-id": node.attrs.fileId,
      class: "taqriz-image",
      loading: "lazy",
    },
  ],
});

/** A PDF / document chip. */
export const FileNode = Node.create({
  name: "file",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ ...fileAttrs, mime: { default: "" } }),
  parseHTML: () => [{ tag: "a[data-file-chip]" }],
  renderHTML: ({ node }) => [
    "a",
    {
      href: `/api/files/${node.attrs.fileId}`,
      target: "_blank",
      rel: "noopener",
      "data-file-chip": "",
      class: "taqriz-file",
    },
    `📎 ${node.attrs.name}`,
  ],
});

function AudioView({ node, editor, getPos, deleteNode, selected }: NodeViewProps) {
  const isVideo = node.type.name === "video";
  const t = useTranslations("taqriz");
  const [busy, setBusy] = useState(false);
  const toText = async () => {
    setBusy(true);
    const r = await transcribeAudioAction(node.attrs.fileId as string);
    setBusy(false);
    if (!r.ok || !r.data.text) return toast.error(t("noSpeech"));
    const at = (getPos() ?? 0) + node.nodeSize;
    const paragraphs = r.data.text
      .split(/\n{1,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
    editor.chain().focus().insertContentAt(at, paragraphs).run();
    toast.success(t("transcribed"));
  };
  return (
    <NodeViewWrapper
      data-drag-handle
      className={`taqriz-audio not-prose my-3 flex flex-wrap items-center gap-2 rounded-xl border p-2.5 ${selected ? "border-primary" : "border-border"} bg-surface`}
      contentEditable={false}
    >
      {isVideo ? (
        <Film className="size-4 shrink-0 text-[var(--c-violet)]" />
      ) : (
        <Music className="size-4 shrink-0 text-[var(--c-rose)]" />
      )}
      <span className="text-muted min-w-0 flex-1 truncate text-xs">
        {node.attrs.name as string}
      </span>
      {isVideo ? (
        <video
          controls
          preload="metadata"
          playsInline
          src={`/api/files/${node.attrs.fileId}`}
          className="max-h-[420px] w-full rounded-lg bg-black"
        />
      ) : (
        <audio
          controls
          preload="metadata"
          src={`/api/files/${node.attrs.fileId}`}
          className="h-9 w-full"
        />
      )}
      <span className="flex w-full justify-end gap-1">
        <button
          type="button"
          onClick={() => void toText()}
          disabled={busy}
          className="text-primary hover:bg-primary-soft inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Type className="size-3.5" />}{" "}
          {busy ? t("transcribing") : t("toText")}
        </button>
        <button
          type="button"
          onClick={deleteNode}
          className="text-muted hover:text-danger hover:bg-surface-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        >
          <Trash2 className="size-3.5" /> {isVideo ? t("removeVideo") : t("removeAudio")}
        </button>
      </span>
    </NodeViewWrapper>
  );
}

/** A voice note: plays inline; can be turned into text below it (the audio stays unless removed). */
export const AudioNode = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => fileAttrs,
  parseHTML: () => [{ tag: "div[data-audio-file]" }],
  renderHTML: ({ node }) => ["div", { "data-audio-file": node.attrs.fileId }],
  addNodeView: () => ReactNodeViewRenderer(AudioView),
});

/** An uploaded video: plays inline; its speech can be turned into text below it. */
export const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => fileAttrs,
  parseHTML: () => [{ tag: "div[data-video-file]" }],
  renderHTML: ({ node }) => ["div", { "data-video-file": node.attrs.fileId }],
  addNodeView: () => ReactNodeViewRenderer(AudioView),
});

function YouTubeView({ node, deleteNode, selected }: NodeViewProps) {
  const t = useTranslations("taqriz");
  const id = node.attrs.videoId as string;
  return (
    <NodeViewWrapper
      data-drag-handle
      className={`not-prose my-3 rounded-xl border p-2 ${selected ? "border-primary" : "border-border"} bg-surface`}
      contentEditable={false}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={(node.attrs.title as string) || "YouTube"}
          className="absolute inset-0 size-full"
          allow="encrypted-media; picture-in-picture; fullscreen"
          loading="lazy"
        />
      </div>
      <span className="mt-1 flex items-center gap-1">
        <Film className="size-3.5 shrink-0 text-[var(--c-violet)]" />
        <span className="text-muted min-w-0 flex-1 truncate text-xs">
          {(node.attrs.title as string) || `youtu.be/${id}`}
        </span>
        <button
          type="button"
          onClick={deleteNode}
          className="text-muted hover:text-danger hover:bg-surface-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        >
          <Trash2 className="size-3.5" /> {t("removeVideo")}
        </button>
      </span>
    </NodeViewWrapper>
  );
}

/** A YouTube video placed in the text (privacy-enhanced embed). */
export const YouTubeNode = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ videoId: { default: null }, title: { default: "" } }),
  parseHTML: () => [
    {
      tag: "div[data-youtube]",
      getAttrs: (el) => ({ videoId: (el as HTMLElement).dataset.youtube }),
    },
  ],
  renderHTML: ({ node }) => ["div", { "data-youtube": node.attrs.videoId }],
  addNodeView: () => ReactNodeViewRenderer(YouTubeView),
});

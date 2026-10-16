/* eslint-disable @next/next/no-img-element */
import { FileText, Music } from "lucide-react";
import { cn } from "@/lib/cn";

export type Attachment = { fileId: string; name: string; mime: string; size?: number };

/** How an attached file looks in a chat bubble or list. */
export function AttachmentView({ a, className }: { a: Attachment; className?: string }) {
  const src = `/api/files/${a.fileId}`;
  if (a.mime.startsWith("image/"))
    return (
      <a href={src} target="_blank" rel="noopener" className={cn("block", className)}>
        <img
          src={src}
          alt={a.name}
          className="border-border max-h-56 rounded-xl border object-cover"
        />
      </a>
    );
  if (a.mime.startsWith("audio/"))
    return (
      <div
        className={cn(
          "border-border bg-surface flex min-w-64 flex-col gap-1 rounded-xl border p-2",
          className,
        )}
      >
        <span className="text-muted flex items-center gap-1.5 px-1 text-xs">
          <Music className="size-3.5" /> {a.name}
        </span>
        <audio controls preload="metadata" src={src} className="h-9 w-full" />
      </div>
    );
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener"
      className={cn(
        "border-border bg-surface hover:bg-surface-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
        className,
      )}
    >
      <FileText className="size-4 shrink-0 text-[var(--c-rose)]" />
      <span className="min-w-0 truncate font-medium">{a.name}</span>
    </a>
  );
}

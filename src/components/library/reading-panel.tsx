"use client";
import { ExternalLink, FileText, Loader2, ScanText, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { deleteFileAction } from "@/app/actions/files";
import { indexFileAction, indexUrlAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { fmtBytes } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { LegalPdfNote } from "./legal-pdf-note";

type Source = {
  kind: "file" | "url";
  status: "pending" | "ready" | "failed";
  pages: number | null;
  url: string | null;
  fileId: string | null;
};

/**
 * Where to read the resource (link / own PDF) and its searchable full text.
 * Uploading a PDF triggers text extraction automatically.
 */
export function ReadingPanel({
  resourceId,
  readingUrl,
  files,
  sources,
  storageEnabled,
  userId,
  pendingPdf,
}: {
  resourceId: string;
  readingUrl: string | null;
  files: { id: string; originalName: string; sizeBytes: number; mimeType: string }[];
  sources: Source[];
  storageEnabled: boolean;
  userId: string;
  /** A PDF uploaded with the new book: read it now. */
  pendingPdf?: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { pending, exec } = useAction();
  const [q, setQ] = useState("");
  const ready = sources.filter((s) => s.status === "ready");
  const pages = ready.reduce((a, s) => a + (s.pages ?? 0), 0);
  const failed = sources.some((s) => s.status === "failed") && !ready.length;
  const pdf = files.find((f) => f.mimeType === "application/pdf");
  const started = useRef(false);
  useEffect(() => {
    if (!pendingPdf || started.current || sources.length) return;
    started.current = true;
    void exec(() => indexFileAction(resourceId, pendingPdf), {
      success: t("resource.pdfIndexed"),
      onSuccess: () => {
        router.replace(`/library/${resourceId}`);
        router.refresh();
      },
    });
  }, [pendingPdf, sources.length, exec, resourceId, router, t]);

  const index = (kind: "file" | "url") =>
    exec(
      () =>
        kind === "file" && pdf
          ? indexFileAction(resourceId, pdf.id)
          : indexUrlAction(resourceId, readingUrl!),
      {
        success: t("resource.indexedPages", { count: "✓" }),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {readingUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={readingUrl} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink /> {t("resource.readOnline")}
            </a>
          </Button>
        )}
        {pdf && (
          <Button asChild variant="outline" size="sm">
            <a href={`/api/files/${pdf.id}`} target="_blank" rel="noopener">
              <FileText /> {t("resource.myPdf")}
            </a>
          </Button>
        )}
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <FileText className="text-muted size-4" />
              <a
                href={`/api/files/${f.id}`}
                target="_blank"
                rel="noopener"
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {f.originalName}
              </a>
              <span className="text-muted text-xs">{fmtBytes(f.sizeBytes)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("common.delete")} ${f.originalName}`}
                onClick={() => exec(() => deleteFileAction(f.id))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <FileUpload
        purpose="attachment"
        enabled={storageEnabled}
        resourceId={resourceId}
        userId={userId}
        label={t("resource.uploadPdf")}
        onUploaded={(fileId) =>
          exec(() => indexFileAction(resourceId, fileId), { onSuccess: () => router.refresh() })
        }
      />
      <LegalPdfNote />

      <div className="bg-surface-2 rounded-xl p-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ScanText className="size-4 text-[var(--c-violet)]" /> {t("resource.fullText")}
          {pending && <Loader2 className="text-muted size-4 animate-spin" />}
        </div>
        <p className="text-muted mt-1 text-xs">
          {pages
            ? t("resource.indexedPages", { count: pages })
            : failed
              ? t("resource.indexFailed")
              : t("resource.indexHint")}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {pdf && (
            <Button size="sm" variant="secondary" loading={pending} onClick={() => index("file")}>
              {ready.some((s) => s.kind === "file")
                ? t("resource.reindex")
                : t("resource.indexText")}{" "}
              · PDF
            </Button>
          )}
          {readingUrl && (
            <Button size="sm" variant="secondary" loading={pending} onClick={() => index("url")}>
              {ready.some((s) => s.kind === "url")
                ? t("resource.reindex")
                : t("resource.indexText")}{" "}
              · URL
            </Button>
          )}
        </div>
        {pages > 0 && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim())
                router.push(
                  `/search?q=${encodeURIComponent(q)}&group=booktext&resource=${resourceId}`,
                );
            }}
          >
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.searchPlaceholder")}
              aria-label={t("common.search")}
              className="h-9"
            />
            <Button type="submit" size="sm" variant="outline" className="h-9">
              <Search />
            </Button>
          </form>
        )}
      </div>
      <Link
        href={`/library/${resourceId}/taqriz?ai=write`}
        className="text-primary text-xs font-medium hover:underline"
      >
        {t("taqriz.askAi")} →
      </Link>
    </div>
  );
}

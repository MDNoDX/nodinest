"use client";
import {
  Check,
  Download,
  FileText,
  FileType2,
  Loader2,
  NotebookText,
  ScrollText,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { DropdownMenu as M } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const FORMATS = [
  { key: "pdf", icon: FileText, hue: "var(--c-rose)" },
  { key: "docx", icon: FileType2, hue: "var(--c-blue)" },
  { key: "md", icon: NotebookText, hue: "var(--c-violet)" },
  { key: "txt", icon: ScrollText, hue: "var(--c-slate)" },
] as const;

/**
 * "Yuklab olish": PDF (print-ready, with cover and contents), Word, Markdown
 * or plain text — one write-up (`resourceId`) or all of them.
 */
export function ExportMenu({
  resourceId,
  beforeDownload,
  size = "sm",
  variant = "outline",
  label,
  className,
}: {
  resourceId?: string;
  /** e.g. the editor flushes unsaved text first */
  beforeDownload?: () => Promise<void> | void;
  size?: "sm" | "md";
  variant?: "outline" | "secondary" | "ghost" | "primary";
  label?: string;
  className?: string;
}) {
  const t = useTranslations("export");
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (format: string) => {
    setBusy(format);
    try {
      await beforeDownload?.();
      const base = resourceId ? `/api/export/taqriz/${resourceId}` : "/api/export/taqriz";
      const url = `${base}?format=${format}${notes ? "&notes=1" : ""}`;
      // The Mac app saves attachment responses itself (to ~/Downloads).
      if (/NodiNestMac\//.test(navigator.userAgent)) {
        const link = document.createElement("a");
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success(t("savingToDownloads"));
        return;
      }
      // Check first so errors show as a message, not as a broken file.
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const code = (await res.json().catch(() => ({})))?.error;
        toast.error(
          code === "NOT_FOUND"
            ? t("nothing")
            : code === "RATE_LIMITED"
              ? t("tooMany")
              : t("failed"),
        );
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const name = decodeURIComponent(
        /filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? `nodinest.${format}`,
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast.success(t("ready", { name }));
    } catch {
      toast.error(navigator.onLine ? t("failed") : t("offline"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <M.Root>
      <M.Trigger asChild>
        <Button variant={variant} size={size} className={className} disabled={!!busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />} {label ?? t("download")}
        </Button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={6}
          className="border-border bg-surface animate-scale-in z-50 w-64 rounded-xl border p-1.5 shadow-xl"
        >
          <M.Label className="text-muted px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide uppercase">
            {resourceId ? t("thisOne") : t("all")}
          </M.Label>
          {FORMATS.map(({ key, icon: Icon, hue }) => (
            <M.Item
              key={key}
              onSelect={() => void download(key)}
              className="data-[highlighted]:bg-surface-2 flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm outline-none"
            >
              <Icon className="mt-0.5 size-4 shrink-0" style={{ color: hue }} />
              <span className="flex flex-col">
                <span className="font-medium">{t(`formats.${key}`)}</span>
                <span className="text-muted text-xs">{t(`hints.${key}`)}</span>
              </span>
            </M.Item>
          ))}
          <M.Separator className="bg-border my-1 h-px" />
          <M.CheckboxItem
            checked={notes}
            onSelect={(e) => {
              e.preventDefault();
              setNotes((v) => !v);
            }}
            className="data-[highlighted]:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm outline-none"
          >
            <span
              className={cn(
                "grid size-4 place-items-center rounded border",
                notes
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border-strong",
              )}
            >
              {notes && <Check className="size-3" />}
            </span>
            {t("withNotes")}
          </M.CheckboxItem>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

import { HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";

const mb = (b: number) => Math.round(b / (1024 * 1024));

/**
 * Shown only when the upload space is nearly full: suggests downloading books
 * with their media (ZIP / EPUB) and then removing big audio / video files.
 */
export function StorageHint({ used, quota }: { used: number; quota: number }) {
  const t = useTranslations("write");
  if (used < quota * 0.8) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-[var(--c-amber)]/40 bg-[var(--c-amber)]/10 p-4 text-sm"
    >
      <HardDrive className="mt-0.5 size-5 shrink-0 text-[var(--c-amber)]" />
      <div>
        <p className="font-medium">{t("storageFull", { used: mb(used), quota: mb(quota) })}</p>
        <p className="text-muted mt-1 leading-relaxed">{t("storageFullBody")}</p>
      </div>
    </div>
  );
}

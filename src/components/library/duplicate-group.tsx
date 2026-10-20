"use client";
import { Merge } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { mergeResourcesAction } from "@/app/actions/catalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";

type Item = {
  id: string;
  title: string;
  type: string;
  authors: string | null;
  status: string | null;
  createdAt: string;
};

const KEY = "nn:dup-dismissed";
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/** One group of likely duplicates: choose the entry to keep and merge the rest into it. */
export function DuplicateGroupCard({ items }: { items: Item[] }) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  // Keep the entry the user actually uses (has a status), else the oldest.
  const [keep, setKeep] = useState(items.find((i) => i.status)?.id ?? items[0].id);
  const groupKey = items
    .map((i) => i.id)
    .sort()
    .join(",");
  const dismissed = useSyncExternalStore(subscribe, read, () => "")
    .split("|")
    .includes(groupKey);
  if (dismissed) return null;
  return (
    <div className="card p-4">
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id}>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5",
                keep === i.id
                  ? "border-primary bg-primary-soft/40"
                  : "border-border hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name={groupKey}
                checked={keep === i.id}
                onChange={() => setKeep(i.id)}
                className="accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1">
                <Link
                  href={`/library/${i.id}`}
                  target="_blank"
                  className="block truncate font-semibold hover:underline"
                >
                  {i.title}
                </Link>
                <span className="text-muted block truncate text-xs">
                  {i.authors ?? t(`types.${i.type}`)}
                </span>
              </span>
              {i.status && (
                <Badge tone="success">
                  {t(
                    `status.${i.status === "abandoned" || i.status === "paused" ? "in_progress" : i.status}`,
                  )}
                </Badge>
              )}
              {keep === i.id && <Badge tone="primary">{t("duplicates.keep")}</Badge>}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            exec(
              () =>
                mergeResourcesAction(
                  keep,
                  items.filter((i) => i.id !== keep).map((i) => i.id),
                ),
              {
                success: t("duplicates.merged"),
              },
            )
          }
        >
          <Merge /> {t("duplicates.merge")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem(KEY, [read(), groupKey].filter(Boolean).join("|"));
              window.dispatchEvent(new StorageEvent("storage"));
            } catch {
              /* ignore */
            }
          }}
        >
          {t("duplicates.different")}
        </Button>
      </div>
    </div>
  );
}

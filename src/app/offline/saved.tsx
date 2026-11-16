"use client";
import { BookOpen, FileText, FolderOpen, LayoutGrid, NotebookPen, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { savedPages } from "@/lib/offline-sync";
import type { OfflinePageRef } from "@/server/offline";

const noop = () => () => {};
const GROUPS: OfflinePageRef["group"][] = [
  "section",
  "read",
  "item",
  "taqriz",
  "collection",
  "note",
];
const ICON = {
  section: LayoutGrid,
  read: BookOpen,
  item: FileText,
  taqriz: PenLine,
  collection: FolderOpen,
  note: NotebookPen,
};
const EMPTY: OfflinePageRef[] = [];
let cache: { raw: string | null; list: OfflinePageRef[] } = { raw: null, list: EMPTY };
const read = () => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("nn:offline-pages");
  } catch {
    /* blocked */
  }
  if (raw !== cache.raw) cache = { raw, list: raw ? savedPages() : EMPTY };
  return cache.list;
};

/** The pages this device keeps (offline mode): plain links, served by the worker. */
export function SavedPages() {
  const t = useTranslations("offline");
  const tn = useTranslations("nav");
  const list = useSyncExternalStore(noop, read, () => EMPTY);
  if (!list.length) return null;
  return (
    <div className="mt-8 w-full max-w-md text-left">
      <h2 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
        {t("savedTitle")}
      </h2>
      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => {
          const rows = list.filter((p) => p.group === g && (g === "section" || p.title));
          if (!rows.length) return null;
          const Icon = ICON[g];
          return (
            <section key={g}>
              <h3 className="mb-1 text-sm font-semibold">{t(`groups.${g}`)}</h3>
              <ul className="card divide-border divide-y overflow-hidden">
                {rows.map((p) => (
                  <li key={p.url}>
                    {/* A full load: the worker answers it from the saved copy. */}
                    <a
                      href={p.url}
                      className="hover:bg-surface-2 flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Icon className="text-muted size-4 shrink-0" />
                      <span className="truncate">
                        {g === "section" ? (tn.has(p.title) ? tn(p.title) : p.url) : p.title}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

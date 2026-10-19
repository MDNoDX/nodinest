"use client";
import { Check, ChevronDown, Loader2, Plus, Quote, Search, StickyNote } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  searchCollectionCandidatesAction,
  toggleCollectionItemAction,
} from "@/app/actions/personal";
import { Cover, coverSrc } from "@/components/library/cover";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/hooks";
import type { CollectionCandidate } from "@/server/notes";

/**
 * Adds things to a collection from inside it: search the library / catalog
 * or your notes & quotes and press + (press ✓ again to take it out).
 */
export function CollectionAdder({ collectionId, empty }: { collectionId: string; empty: boolean }) {
  const t = useTranslations("collections");
  const te = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState<"resource" | "note">("resource");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const [res, setRes] = useState<{ key: string; items: CollectionCandidate[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const key = `${kind}|${query}`;
  const loading = open && res?.key !== key;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void searchCollectionCandidatesAction(collectionId, query, kind).then((r) => {
      if (alive) setRes({ key: `${kind}|${query}`, items: r.ok ? r.data : [] });
    });
    return () => {
      alive = false;
    };
  }, [collectionId, query, kind, open]);

  const toggle = async (c: CollectionCandidate) => {
    setBusy(c.id);
    const r = await toggleCollectionItemAction(
      collectionId,
      c.kind === "resource" ? { resourceId: c.id } : { noteId: c.id },
      !c.added,
    );
    setBusy(null);
    if (!r.ok) return toast.error(te(r.code));
    setRes(
      (cur) =>
        cur && {
          ...cur,
          items: cur.items.map((x) =>
            x.id === c.id && x.kind === c.kind ? { ...x, added: !c.added } : x,
          ),
        },
    );
    router.refresh();
  };

  const items = res?.key === key ? res.items : (res?.items ?? []);
  return (
    <section className="card mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
        aria-expanded={open}
      >
        <Plus className="text-primary size-4" />
        {t("addHere")}
        <ChevronDown
          className={cn("text-muted ml-auto size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-border border-t px-4 pt-3 pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div role="tablist" className="bg-surface-2 flex w-fit rounded-lg p-0.5 text-xs">
              {(["resource", "note"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium whitespace-nowrap",
                    kind === k
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {t(k === "resource" ? "tabResources" : "tabNotes")}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus={empty}
                placeholder={t(kind === "resource" ? "searchResources" : "searchNotes")}
                className="border-border-strong bg-surface focus-visible:outline-ring/40 h-10 w-full rounded-lg border pr-9 pl-9 text-sm"
              />
              {loading && (
                <Loader2 className="text-muted absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
              )}
            </div>
          </div>
          {!query && items.length > 0 && (
            <p className="text-muted mt-3 text-xs">
              {t(kind === "resource" ? "recentLibrary" : "recentNotes")}
            </p>
          )}
          <ul className="divide-border mt-2 max-h-[22rem] divide-y overflow-y-auto">
            {items.map((c) => (
              <li key={`${c.kind}:${c.id}`} className="flex items-center gap-3 py-2">
                {c.kind === "resource" ? (
                  <Cover
                    type={c.type as "book"}
                    title={c.title}
                    src={coverSrc(c)}
                    size="sm"
                    className="shrink-0"
                  />
                ) : c.noteKind === "quote" ? (
                  <Quote className="text-accent size-5 shrink-0" />
                ) : (
                  <StickyNote className="text-muted size-5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  {c.kind === "resource" ? (
                    <>
                      <div className="truncate text-sm font-medium">{c.title}</div>
                      <div className="text-muted flex items-center gap-1.5 truncate text-xs">
                        {c.authors}
                        {c.mine && (
                          <span className="bg-surface-2 rounded px-1.5 py-px text-[10px] font-medium">
                            {t("inMyLibrary")}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={cn(
                          "line-clamp-2 text-sm",
                          c.noteKind === "quote" && "font-serif italic",
                        )}
                      >
                        {c.noteKind === "quote" ? `“${c.text}”` : c.text}
                      </div>
                      {c.resourceTitle && (
                        <div className="text-muted truncate text-xs">{c.resourceTitle}</div>
                      )}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy === c.id}
                  onClick={() => void toggle(c)}
                  aria-pressed={c.added}
                  aria-label={c.added ? t("removeHere") : t("add")}
                  title={c.added ? t("removeHere") : t("add")}
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full border transition-colors",
                    c.added
                      ? "border-success bg-success-soft text-success"
                      : "border-border hover:border-primary hover:text-primary",
                  )}
                >
                  {busy === c.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : c.added ? (
                    <Check className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!loading && items.length === 0 && (
            <p className="text-muted py-4 text-center text-sm">
              {query ? t("nothingFound") : t(kind === "resource" ? "libraryEmpty" : "notesEmpty")}{" "}
              {kind === "resource" && (
                <Link href="/library/new" className="text-primary font-medium hover:underline">
                  {t("addNewResource")}
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

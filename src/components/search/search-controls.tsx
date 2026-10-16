"use client";
import { Check, Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { hueFor, hueStyle } from "@/lib/hues";
import { LEARNING_STATUSES, RESOURCE_TYPES } from "@/lib/validation";

type Cat = { id: string; name: string };

/**
 * Live search controls: results update while typing (debounced) and on every
 * filter change — no "Search" button needed. State lives in the URL.
 */
export function SearchControls({ categories }: { categories: Cat[] }) {
  const t = useTranslations();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const genres = params.getAll("g");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = (patch: Record<string, string | string[] | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      u.delete(k);
      for (const x of Array.isArray(v) ? v : v ? [v] : []) u.append(k, x);
    }
    u.delete("page");
    start(() => router.replace(`${path}${u.size ? `?${u}` : ""}`, { scroll: false }));
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onType = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ q: v.trim() || null }), 350);
  };

  return (
    <div className="mb-5 flex flex-col gap-3">
      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          push({ q: q.trim() || null });
        }}
      >
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => onType(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("common.search")}
          className="h-12 pr-11 pl-11 text-base"
          autoFocus={!q}
          enterKeyHint="search"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2">
          {pending ? (
            <Loader2 className="text-muted size-4 animate-spin" />
          ) : q ? (
            <button
              type="button"
              aria-label={t("common.reset")}
              className="text-muted hover:text-foreground rounded p-1"
              onClick={() => onType("")}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </span>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={params.get("type") ?? ""}
          onChange={(e) => push({ type: e.target.value || null })}
          aria-label={t("common.type")}
          className="w-auto"
        >
          <option value="">{t("library.allTypes")}</option>
          {RESOURCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {t(`types.${r}`)}
            </option>
          ))}
        </Select>
        <Select
          value={params.get("status") ?? ""}
          onChange={(e) => push({ status: e.target.value || null })}
          aria-label={t("library.myStatus")}
          className="w-auto"
        >
          <option value="">{t("library.anyStatus")}</option>
          {LEARNING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
          <option value="none">{t("status.notInLibrary")}</option>
        </Select>
        <Select
          value={params.get("sort") ?? "relevance"}
          onChange={(e) => push({ sort: e.target.value === "relevance" ? null : e.target.value })}
          aria-label={t("common.sort")}
          className="w-auto"
        >
          <option value="relevance">{t("search.relevance")}</option>
          <option value="title">{t("search.sortTitle")}</option>
          <option value="date">{t("search.sortDate")}</option>
          <option value="updated">{t("search.sortUpdated")}</option>
        </Select>
        {params.size > 0 && (
          <button
            type="button"
            className="text-muted hover:text-foreground ml-1 text-sm"
            onClick={() => {
              setQ("");
              start(() => router.replace(path));
            }}
          >
            {t("common.reset")}
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("search.genres")}>
          {categories.map((c) => {
            const on = genres.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                style={hueStyle(hueFor(c.id))}
                onClick={() =>
                  push({ g: on ? genres.filter((g) => g !== c.id) : [...genres, c.id] })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  on
                    ? "chip hue-border"
                    : "border-border-strong text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {on && <Check className="size-3.5" />}
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

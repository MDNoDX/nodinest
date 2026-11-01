"use client";
import { Eye, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { VisibilityToggle } from "./visibility-toggle";

type Item = { resourceId: string; title: string; type: string; public: boolean };

/**
 * On my profile: every item of my library with its own switch — what others
 * see on my page (books, courses, videos, podcasts…), changed right here.
 */
export function ItemsVisibility({
  items,
  profilePublic,
}: {
  items: Item[];
  profilePublic: boolean;
}) {
  const t = useTranslations("social");
  const tt = useTranslations("types");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const k = q.trim().toLowerCase();
  const list = items.filter((i) => !k || i.title.toLowerCase().includes(k));
  const shown = all || k ? list : list.slice(0, 8);
  const open = items.filter((i) => i.public).length;
  return (
    <section className="card flex flex-col gap-3 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[var(--c-emerald)]/12 text-[var(--c-emerald)]">
          <Eye className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t("whatOthersSee")}</h2>
          <p className="text-muted text-xs">
            {t("whatOthersSeeHint", { open, total: items.length })}
          </p>
        </div>
      </div>
      {items.length > 8 && (
        <div className="relative">
          <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("filterItems")}
            className="h-9 pl-9 text-sm"
          />
        </div>
      )}
      <ul className="divide-border divide-y">
        {shown.map((i) => (
          <li key={i.resourceId} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{i.title}</span>
              <span className="text-muted text-xs">{tt(i.type as "book")}</span>
            </span>
            <VisibilityToggle
              resourceId={i.resourceId}
              initial={i.public}
              profilePublic={profilePublic}
            />
          </li>
        ))}
      </ul>
      {!all && !k && list.length > 8 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="text-primary self-start text-sm font-medium hover:underline"
        >
          {t("showAllN", { n: list.length })}
        </button>
      )}
    </section>
  );
}

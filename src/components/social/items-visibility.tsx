"use client";
import { Eye, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { VisibilityToggle } from "./visibility-toggle";

type Item = {
  resourceId: string;
  title: string;
  type: string;
  public: boolean;
  writeup: boolean | null;
  audiobook: boolean | null;
  text: boolean | null;
};

/**
 * On my profile: every item of my library with its own switch — what others
 * see on my page (books, courses, videos, podcasts…), changed right here.
 */
export function ItemsVisibility({
  items,
  profilePublic,
  username,
}: {
  items: Item[];
  profilePublic: boolean;
  username: string;
}) {
  const t = useTranslations("social");
  const tt = useTranslations("types");
  const [q, setQ] = useState("");
  const k = q.trim().toLowerCase();
  const shown = items.filter((i) => !k || i.title.toLowerCase().includes(k));
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
      {items.length > 5 && (
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
            {/* The title opens the post as others see it (open), or the item in my library. */}
            <Link
              href={i.public ? `/u/${username}/item/${i.resourceId}` : `/library/${i.resourceId}`}
              className="group min-w-0 flex-1"
            >
              <span className="block truncate text-sm font-medium group-hover:underline">
                {i.title}
              </span>
              <span className="text-muted text-xs">{tt(i.type as "book")}</span>
            </Link>
            <VisibilityToggle
              resourceId={i.resourceId}
              initial={i.public}
              profilePublic={profilePublic}
              extras={{ writeup: i.writeup, audiobook: i.audiobook, text: i.text }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

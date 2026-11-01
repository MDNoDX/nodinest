"use client";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { PublicItem } from "@/server/social";
import { ItemGrid } from "./item-grid";

/** All of someone's public items, with a search box. */
export function AllItems({ items }: { items: PublicItem[] }) {
  const t = useTranslations("social");
  const [q, setQ] = useState("");
  const k = q.trim().toLowerCase();
  return (
    <>
      <div className="relative">
        <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("filterItems")}
          className="pl-9"
        />
      </div>
      <ItemGrid items={items.filter((i) => !k || i.title.toLowerCase().includes(k))} />
    </>
  );
}

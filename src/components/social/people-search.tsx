"use client";
import { Loader2, Search, UserCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { followAction } from "@/app/actions/social";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

type Person = {
  id: string;
  name: string;
  username: string;
  image: string | null;
  premium: boolean;
  items: number;
  isFollowing: boolean;
};

/** Search people on the site as you type (from the first letter) and follow them. */
export function PeopleSearch() {
  const t = useTranslations("social");
  const [q, setQ] = useState("");
  const [list, setList] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const k = q.trim();
    if (!k) {
      queueMicrotask(() => setList(null));
      return;
    }
    const n = ++seq.current;
    const id = setTimeout(async () => {
      setBusy(true);
      const r = await fetch(`/api/people?q=${encodeURIComponent(k)}`).catch(() => null);
      const d = r?.ok ? ((await r.json()) as { people: Person[] }) : { people: [] };
      if (n === seq.current) {
        setList(d.people);
        setBusy(false);
      }
    }, 150);
    return () => clearTimeout(id);
  }, [q]);

  const toggle = async (p: Person) => {
    setList((l) => l?.map((x) => (x.id === p.id ? { ...x, isFollowing: !x.isFollowing } : x)) ?? l);
    const r = await followAction(p.id, !p.isFollowing);
    if (!r.ok)
      setList(
        (l) => l?.map((x) => (x.id === p.id ? { ...x, isFollowing: p.isFollowing } : x)) ?? l,
      );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="relative">
        <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("peopleTitle")}
          className="pl-9"
          autoComplete="off"
        />
        {busy && (
          <Loader2 className="text-muted absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
        )}
      </div>
      {list &&
        (list.length === 0 ? (
          <p className="text-muted text-sm">{t("nobody")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.map((p) => (
              <li key={p.id} className="card flex items-center gap-3 p-3">
                <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={p.name} image={p.image} className="size-10" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate font-semibold">
                      {p.name} {p.premium && <PremiumBadge />}
                    </span>
                    <span className="text-muted block truncate text-xs">
                      @{p.username} · {t("itemsN", { n: p.items })}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void toggle(p)}
                  className={
                    p.isFollowing
                      ? "border-border text-muted inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium"
                      : "bg-primary text-primary-foreground inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium"
                  }
                >
                  {p.isFollowing ? (
                    <UserCheck className="size-3.5" />
                  ) : (
                    <UserPlus className="size-3.5" />
                  )}
                  {p.isFollowing ? t("following") : t("follow")}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

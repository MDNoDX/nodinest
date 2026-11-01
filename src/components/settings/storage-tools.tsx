"use client";
import { Headphones, HardDrive, Image as ImageIcon, Library, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtBytes } from "@/lib/format";

/**
 * What this device keeps (so pages, books and audiobooks open fast and
 * offline) and buttons to free it. Clearing never touches the account: notes,
 * books, write-ups and prepared audiobooks stay on the server and come back.
 */
const GROUPS = [
  { key: "audio", icon: Headphones, match: (n: string) => n === "nn-audiobook" },
  { key: "books", icon: Library, match: (n: string) => n === "nn-books" },
  {
    key: "site",
    icon: ImageIcon,
    match: (n: string) => n.startsWith("nn-") && n !== "nn-audiobook" && n !== "nn-books",
  },
] as const;

async function cacheSize(names: string[]) {
  let n = 0;
  for (const name of names) {
    const c = await caches.open(name);
    for (const req of await c.keys()) {
      const r = await c.match(req);
      const len = Number(r?.headers.get("content-length") ?? 0);
      n += len || (r ? (await r.clone().blob()).size : 0);
    }
  }
  return n;
}

export function StorageTools() {
  const t = useTranslations("settings.device");
  const [sizes, setSizes] = useState<Record<string, number> | null>(null);
  const [total, setTotal] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const measure = async () => {
    if (!("caches" in window)) return setSizes({});
    const names = await caches.keys();
    const out: Record<string, number> = {};
    for (const g of GROUPS) out[g.key] = await cacheSize(names.filter(g.match));
    setSizes(out);
    const e = await navigator.storage?.estimate?.().catch(() => null);
    if (e?.usage != null && e.quota) setTotal({ usage: e.usage, quota: e.quota });
  };
  useEffect(() => {
    queueMicrotask(() => void measure());
  }, []);

  const clear = async (key: (typeof GROUPS)[number]["key"] | "all") => {
    if (!window.confirm(t(key === "all" ? "confirmAll" : `confirm_${key}`))) return;
    setBusy(key);
    const names = await caches.keys();
    for (const n of names)
      if (key === "all" ? n.startsWith("nn-") : GROUPS.find((g) => g.key === key)!.match(n))
        await caches.delete(n);
    setBusy(null);
    toast.success(t("cleared"));
    void measure();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">{t("intro")}</p>
      {total && (
        <p className="flex items-center gap-2 text-sm">
          <HardDrive className="text-muted size-4" />
          {t("deviceTotal", { used: fmtBytes(total.usage) })}
        </p>
      )}
      <ul className="divide-border border-border divide-y rounded-xl border">
        {GROUPS.map((g) => (
          <li key={g.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <g.icon className="text-muted size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {t(`${g.key}Title`)}{" "}
                <span className="text-muted font-normal tabular-nums">
                  · {sizes ? fmtBytes(sizes[g.key] ?? 0) : "…"}
                </span>
              </div>
              <p className="text-muted text-xs">{t(`${g.key}Hint`)}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              loading={busy === g.key}
              disabled={!sizes?.[g.key]}
              onClick={() => void clear(g.key)}
            >
              <Trash2 /> {t("clear")}
            </Button>
          </li>
        ))}
      </ul>
      <div className="bg-surface-2 rounded-xl p-3 text-xs leading-relaxed">
        <p className="font-medium">{t("safeTitle")}</p>
        <p className="text-muted mt-0.5">{t("safeBody")}</p>
      </div>
      <Button
        variant="outline"
        className="self-start"
        loading={busy === "all"}
        onClick={() => void clear("all")}
      >
        <Trash2 /> {t("clearAll")}
      </Button>
    </div>
  );
}

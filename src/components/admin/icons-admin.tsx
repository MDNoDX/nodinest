"use client";
/* eslint-disable @next/next/no-img-element */
import { Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { addIconAction, removeIconAction } from "@/app/actions/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EmptyState } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

type Icon = { id: string; name: string; words: string };

/** Find a colour icon on the internet, name it, say which plan words call it. */
export function IconsAdmin({ initial }: { initial: Icon[] }) {
  const t = useTranslations("admin");
  const [list, setList] = useState(initial);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const { pending, exec } = useAction();

  const search = async () => {
    setBusy(true);
    const r = await fetch(`/api/admin/icons?q=${encodeURIComponent(q)}`).catch(() => null);
    const d = r?.ok ? ((await r.json()) as { icons: string[] }) : { icons: [] };
    setFound(d.icons);
    setBusy(false);
  };
  const add = () =>
    pick &&
    exec(() => addIconAction({ icon: pick, name: name || q, words: words || q }), {
      onSuccess: (icon) => {
        setList((l) => [...l, icon as Icon]);
        setPick(null);
        setName("");
        setWords("");
      },
      success: t("iconAdded"),
    });

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length > 1) void search();
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("iconSearch")}
            aria-label={t("iconSearch")}
          />
          <Button type="submit" loading={busy}>
            <Search /> {t("iconFind")}
          </Button>
        </form>
        <p className="text-muted text-xs">{t("iconHint")}</p>
        {found && found.length === 0 && <p className="text-muted text-sm">{t("iconNone")}</p>}
        {found && found.length > 0 && (
          <ul className="grid grid-cols-6 gap-1 sm:grid-cols-10 lg:grid-cols-12">
            {found.map((icon) => (
              <li key={icon}>
                <button
                  type="button"
                  title={icon}
                  aria-pressed={pick === icon}
                  onClick={() => setPick(icon)}
                  className={cn(
                    "hover:bg-surface-2 grid aspect-square w-full place-items-center rounded-lg p-1.5",
                    pick === icon && "bg-primary-soft ring-primary ring-2",
                  )}
                >
                  <img
                    src={`/api/admin/icons?icon=${encodeURIComponent(icon)}`}
                    alt=""
                    loading="lazy"
                    className="size-8"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pick && (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              className="min-w-40 flex-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("iconName")}
              aria-label={t("iconName")}
            />
            <Input
              className="min-w-56 flex-[2]"
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder={t("iconWords")}
              aria-label={t("iconWords")}
            />
            <Button onClick={add} loading={pending}>
              <Plus /> {t("iconAdd")}
            </Button>
          </div>
        )}
      </Card>
      {list.length === 0 ? (
        <EmptyState title={t("iconEmpty")} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => (
            <li key={i.id} className="card flex items-center gap-3 p-3">
              <img src={`/api/plan-icons/${i.id}`} alt="" className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.name}</span>
                <span className="text-muted block truncate text-xs">{i.words}</span>
              </span>
              <button
                type="button"
                aria-label={t("iconRemove")}
                title={t("iconRemove")}
                className="text-muted hover:text-danger p-1"
                onClick={() =>
                  exec(() => removeIconAction(i.id), {
                    onSuccess: () => setList((l) => l.filter((x) => x.id !== i.id)),
                  })
                }
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

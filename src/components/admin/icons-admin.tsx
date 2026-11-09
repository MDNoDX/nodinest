"use client";
/* eslint-disable @next/next/no-img-element */
import {
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  Globe,
  ImageUp,
  Link2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  grabIconAction,
  removeIconAction,
  resetIconAction,
  saveIconAction,
  saveIconOrderAction,
} from "@/app/actions/icons";
import { ask } from "@/components/ui/ask";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { ActionResult } from "@/lib/errors";
import { normalizeText } from "@/lib/normalize";
import { NO_ICONS, iconSrc, pickerKeys, type PlanIconsCfg } from "@/lib/plan-icons";
import { useDragOrder } from "@/lib/use-drag-order";

/** How many icons the plan window shows first (the owner sees where that ends). */
const FIRST = 6;

/**
 * Every plan icon in one place, in the order the plan window offers them:
 * press one to change its picture (internet, a file, a link) or its words,
 * hold and drag to move it. Added icons sit among ours.
 */
export function IconsAdmin({ initial }: { initial: PlanIconsCfg }) {
  const t = useTranslations("admin");
  const tn = useTranslations("planIcons");
  const te = useTranslations("errors");
  const [cfg, setCfg] = useState(initial);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const keys = pickerKeys(cfg);
  const nameOf = (k: string) =>
    k.startsWith("c:") ? (cfg.custom.find((c) => `c:${c.id}` === k)?.name ?? "") : tn(k as "pin");

  const apply = async (p: Promise<ActionResult<PlanIconsCfg>>, ok?: string) => {
    const r = await p.catch(() => null);
    if (!r?.ok) {
      errorToast(te, r && !r.ok ? r : "INTERNAL");
      return false;
    }
    setCfg(r.data);
    if (ok) toast.success(ok);
    return true;
  };
  const reorder = (next: string[]) => {
    setCfg((c) => ({ ...c, order: next }));
    void apply(saveIconOrderAction(next));
  };
  const { list, shown, dragged, start, swallowClick } = useDragOrder(keys, (k) => k, reorder, {
    grid: true,
  });

  const needle = normalizeText(q).trim();
  const filtered = needle
    ? shown.filter((k) => normalizeText(`${nameOf(k)} ${k}`).includes(needle))
    : shown;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-semibold">
            {t("iconsTitle")}{" "}
            <span className="text-muted text-sm font-normal">
              · {t("iconsCount", { n: keys.length })}
            </span>
          </h2>
          {cfg.order && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (await ask({ message: t("iconOrderResetAsk"), danger: false }))
                  void apply(saveIconOrderAction(null), t("iconOrderSaved"));
              }}
            >
              <RotateCcw /> {t("iconOrderReset")}
            </Button>
          )}
          <Button size="sm" onClick={() => setOpen("new")}>
            <Plus /> {t("iconNew")}
          </Button>
        </div>
        <label className="bg-surface-2 flex h-10 items-center gap-2 rounded-xl px-3">
          <Search className="text-muted size-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("iconFilter")}
            aria-label={t("iconFilter")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={t("iconClear")}>
              <X className="text-muted size-4" />
            </button>
          )}
        </label>
        <p className="text-muted text-xs">{t("iconsHint", { n: FIRST })}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted py-8 text-center text-sm">{t("iconNone")}</p>
      ) : (
        <ul
          ref={list as React.RefObject<HTMLUListElement>}
          className="grid grid-cols-4 gap-2 select-none sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
        >
          {filtered.map((k) => {
            const i = shown.indexOf(k);
            const changed = !!cfg.over[k];
            const own = k.startsWith("c:");
            return (
              <li
                key={k}
                // Dragging only on the whole list: a filtered list has gaps.
                onPointerDown={needle ? undefined : (e) => start(e, keys.indexOf(k))}
                className={cn(
                  "transition-transform",
                  dragged === k && "ring-primary/50 z-10 scale-105 rounded-2xl shadow-lg ring-2",
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  title={nameOf(k)}
                  onClick={() => !swallowClick.current && setOpen(k)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(k)}
                  className={cn(
                    "bg-surface border-border hover:border-primary/50 relative flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-1.5 pt-3 pb-2 transition-colors",
                    !needle && i < FIRST && "bg-primary-soft/40 border-primary/30",
                  )}
                >
                  <span className="text-muted absolute top-1 left-1.5 text-[10px] tabular-nums">
                    {i + 1}
                  </span>
                  {(changed || own) && (
                    <span
                      className={cn(
                        "absolute top-1.5 right-1.5 size-2 rounded-full",
                        own ? "bg-emerald-500" : "bg-primary",
                      )}
                      title={own ? t("iconOwn") : t("iconChanged")}
                    />
                  )}
                  <img
                    src={iconSrc(k, cfg)}
                    alt=""
                    draggable={false}
                    className="size-10 object-contain"
                  />
                  <span className="w-full truncate text-center text-xs font-medium">
                    {nameOf(k)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="text-muted flex flex-wrap gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-primary size-2 rounded-full" /> {t("iconChanged")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> {t("iconOwn")}
        </span>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <IconEditor
            key={open}
            k={open}
            cfg={cfg}
            name={open === "new" ? "" : nameOf(open)}
            index={keys.indexOf(open)}
            total={keys.length}
            apply={apply}
            onMove={(to) => {
              const next = keys.filter((x) => x !== open);
              next.splice(to, 0, open);
              reorder(next);
            }}
            onClose={() => setOpen(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

type Pending = { type: string; data: string; src: string };

/** A file, a fetched SVG or a picture from a link, as base64 + a preview. */
function readBlob(b: Blob, type = b.type): Promise<Pending> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => {
      const src = String(r.result);
      ok({ type, data: src.slice(src.indexOf(",") + 1), src });
    };
    r.onerror = () => fail(r.error);
    r.readAsDataURL(b);
  });
}

/** A big photo is made small first (the server makes it 192 px anyway). */
async function fromFile(f: File): Promise<Pending> {
  if (f.type === "image/svg+xml" || /\.svg$/i.test(f.name)) return readBlob(f, "image/svg+xml");
  if (f.size < 400_000) return readBlob(f);
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  if (!blob) throw new Error("draw");
  return readBlob(blob, "image/png");
}

function IconEditor({
  k,
  cfg,
  name: name0,
  index,
  total,
  apply,
  onMove,
  onClose,
}: {
  k: string;
  cfg: PlanIconsCfg;
  name: string;
  index: number;
  total: number;
  apply: (p: Promise<ActionResult<PlanIconsCfg>>, ok?: string) => Promise<boolean>;
  onMove: (to: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const isNew = k === "new";
  const own = k.startsWith("c:") ? cfg.custom.find((c) => `c:${c.id}` === k) : undefined;
  const ours = !isNew && !own;
  const words0 = own ? own.words : (cfg.words[k] ?? "");
  const [name, setName] = useState(name0);
  const [words, setWords] = useState(words0);
  const [pic, setPic] = useState<Pending | null>(null);
  const [src, setSrc] = useState<"web" | "file" | "url">("web");
  const [busy, setBusy] = useState<string | null>(null);
  // Internet search.
  const [q, setQ] = useState(isNew ? "" : ours ? k : "");
  const [found, setFound] = useState<string[] | null>(null);
  const [url, setUrl] = useState("");

  const dirty = !!pic || words !== words0 || (!ours && name.trim() !== name0);
  const canSave = isNew ? !!pic && !!name.trim() : dirty;

  const search = async () => {
    setBusy("search");
    const r = await fetch(`/api/admin/icons?q=${encodeURIComponent(q.trim())}`).catch(() => null);
    setFound(r?.ok ? ((await r.json()) as { icons: string[] }).icons : []);
    setBusy(null);
  };
  const pickWeb = async (icon: string) => {
    setBusy(icon);
    const r = await fetch(`/api/admin/icons?icon=${encodeURIComponent(icon)}`).catch(() => null);
    setBusy(null);
    if (!r?.ok) return errorToast(te, "FETCH_FAILED");
    setPic(await readBlob(await r.blob(), "image/svg+xml"));
    if (isNew && !name) setName(icon.split(":")[1].replace(/-/g, " ").slice(0, 40));
  };
  const pickFile = async (f: File) => {
    if (f.size > 8 * 1024 * 1024) return void toast.error(t("iconTooBig"));
    try {
      setPic(await fromFile(f));
      if (isNew && !name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 40));
    } catch {
      toast.error(t("iconBadFile"));
    }
  };
  const grab = async () => {
    setBusy("url");
    const r = await grabIconAction(url.trim()).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      if (r?.code === "VALIDATION") return void toast.error(t("iconBadFile"));
      return errorToast(te, r ?? "INTERNAL");
    }
    setPic({ ...r.data, src: `data:${r.data.type};base64,${r.data.data}` });
    if (isNew && !name) {
      const file = decodeURIComponent(new URL(url.trim()).pathname.split("/").pop() ?? "");
      setName(
        file
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]+/g, " ")
          .slice(0, 40),
      );
    }
  };
  const save = async () => {
    setBusy("save");
    const done = await apply(
      saveIconAction({
        key: k,
        name: ours ? undefined : name,
        words,
        picture: pic ? { type: pic.type, data: pic.data } : undefined,
      }).then((r) => {
        if (!r.ok && r.code === "VALIDATION" && pic) toast.error(t("iconBadFile"));
        return r;
      }),
      isNew ? t("iconAdded") : t("iconSaved"),
    );
    setBusy(null);
    if (done) onClose();
  };

  const current = isNew ? null : iconSrc(k, cfg);
  const original = ours && cfg.over[k] ? iconSrc(k, NO_ICONS) : null;
  const tabs = [
    { id: "web" as const, icon: <Globe className="size-4" />, label: t("iconSrcWeb") },
    { id: "file" as const, icon: <ImageUp className="size-4" />, label: t("iconSrcFile") },
    { id: "url" as const, icon: <Link2 className="size-4" />, label: t("iconSrcUrl") },
  ];

  return (
    <DialogContent
      title={isNew ? t("iconNew") : name0}
      closeLabel={tc("close")}
      className="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {/* What it looks like now, and what it will look like. */}
        <div className="bg-surface-2 flex items-center gap-4 rounded-2xl p-4">
          {current && (
            <figure className="flex flex-col items-center gap-1">
              <img
                src={current}
                alt=""
                className={cn("size-14 object-contain", pic && "opacity-40")}
              />
              <figcaption className="text-muted text-[11px]">{t("iconNow")}</figcaption>
            </figure>
          )}
          {pic && (
            <>
              {current && <ArrowRight className="text-muted size-4 shrink-0" />}
              <figure className="flex flex-col items-center gap-1">
                <img
                  src={pic.src}
                  alt=""
                  className="ring-primary size-14 rounded-xl object-contain ring-2 ring-offset-2"
                />
                <figcaption className="text-primary text-[11px] font-semibold">
                  {t("iconPreview")}
                </figcaption>
              </figure>
              <button
                type="button"
                onClick={() => setPic(null)}
                className="text-muted hover:text-foreground self-start p-1"
                aria-label={tc("cancel")}
              >
                <X className="size-4" />
              </button>
            </>
          )}
          {!current && !pic && <p className="text-muted text-sm">{t("iconNoImage")}</p>}
          {original && !pic && (
            <div className="ml-auto flex items-center gap-2">
              <img src={original} alt="" className="size-8 opacity-70" />
              <Button
                variant="outline"
                size="sm"
                loading={busy === "reset"}
                onClick={async () => {
                  setBusy("reset");
                  await apply(resetIconAction(k), t("iconResetDone"));
                  setBusy(null);
                }}
              >
                <RotateCcw /> {t("iconReset")}
              </Button>
            </div>
          )}
        </div>

        {!ours && (
          <Input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("iconName")}
            aria-label={t("iconName")}
          />
        )}
        <div className="flex flex-col gap-1">
          <Input
            value={words}
            maxLength={300}
            onChange={(e) => setWords(e.target.value)}
            placeholder={t("iconWords")}
            aria-label={t("iconWords")}
          />
          <p className="text-muted text-xs">{t("iconWordsHint")}</p>
        </div>

        {/* Where a new picture comes from. */}
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{isNew ? t("iconPicture") : t("iconReplace")}</span>
          <div className="bg-surface-2 grid grid-cols-3 gap-0.5 rounded-xl p-0.5 text-sm">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setSrc(x.id)}
                aria-pressed={src === x.id}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-medium transition",
                  src === x.id ? "bg-surface shadow-sm" : "text-muted",
                )}
              >
                {x.icon} <span className="truncate">{x.label}</span>
              </button>
            ))}
          </div>

          {src === "web" && (
            <div className="flex flex-col gap-2">
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
                <Button type="submit" loading={busy === "search"}>
                  <Search /> {t("iconFind")}
                </Button>
              </form>
              {found && found.length === 0 && <p className="text-muted text-sm">{t("iconNone")}</p>}
              {found && found.length > 0 && (
                <ul className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8">
                  {found.map((icon) => (
                    <li key={icon}>
                      <button
                        type="button"
                        title={icon}
                        disabled={!!busy}
                        onClick={() => void pickWeb(icon)}
                        className={cn(
                          "hover:bg-surface-2 grid aspect-square w-full place-items-center rounded-lg p-1.5",
                          busy === icon && "animate-pulse",
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
              <p className="text-muted text-xs">{t("iconWebHint")}</p>
            </div>
          )}

          {src === "file" && (
            <label
              className="border-border hover:border-primary/60 hover:bg-primary-soft/30 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void pickFile(f);
              }}
            >
              <ImageUp className="text-primary size-7" />
              <span className="text-sm font-medium">{t("iconFilePick")}</span>
              <span className="text-muted text-xs">{t("iconFileHint")}</span>
              <input
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/avif,.svg"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void pickFile(f);
                }}
              />
            </label>
          )}

          {src === "url" && (
            <div className="flex flex-col gap-2">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (/^https?:\/\//i.test(url.trim())) void grab();
                }}
              >
                <Input
                  value={url}
                  inputMode="url"
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…/icon.png"
                  aria-label={t("iconSrcUrl")}
                />
                <Button type="submit" loading={busy === "url"}>
                  {t("iconUrlGet")}
                </Button>
              </form>
              <p className="text-muted text-xs">{t("iconUrlHint")}</p>
            </div>
          )}
        </div>

        {!isNew && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted mr-1">{t("iconPlace", { n: index + 1, total })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={index <= 0}
              onClick={() => onMove(0)}
              aria-label={t("iconMoveFirst")}
              title={t("iconMoveFirst")}
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={index <= 0}
              onClick={() => onMove(index - 1)}
              aria-label={t("iconMoveBack")}
              title={t("iconMoveBack")}
            >
              <ArrowLeft />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={index >= total - 1}
              onClick={() => onMove(index + 1)}
              aria-label={t("iconMoveNext")}
              title={t("iconMoveNext")}
            >
              <ArrowRight />
            </Button>
          </div>
        )}

        <div className="border-border flex items-center gap-2 border-t pt-4">
          <Button onClick={() => void save()} disabled={!canSave} loading={busy === "save"}>
            {isNew ? (
              <>
                <Plus /> {t("iconAdd")}
              </>
            ) : (
              t("iconSave")
            )}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          {own && (
            <Button
              variant="ghost"
              className="text-danger ml-auto"
              loading={busy === "remove"}
              onClick={async () => {
                if (!(await ask({ message: t("iconRemoveAsk"), remove: true }))) return;
                setBusy("remove");
                const ok = await apply(removeIconAction(own.id), t("iconRemoved"));
                setBusy(null);
                if (ok) onClose();
              }}
            >
              <Trash2 /> {t("iconRemove")}
            </Button>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

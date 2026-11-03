"use client";
import { Check, Link2, Loader2, Search, Send, Share2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as D } from "radix-ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { shareToAction } from "@/app/actions/dm";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { DmPerson, DmThreadRow } from "@/server/dm";

/**
 * "Yuborish": one sheet for sharing an item — the people I talk to as round
 * faces (tap several), a search for anyone else, and other apps (the phone's
 * own share sheet with every app, a copied link) for a public post.
 */
export function SendTo({
  resourceId,
  className,
  compact,
  share,
}: {
  resourceId: string;
  className?: string;
  compact?: boolean;
  /** A public post's page: it can also go to other apps as a link. */
  share?: { path: string; title: string; closed?: boolean };
}) {
  const t = useTranslations("chat");
  const te = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<DmPerson[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<DmPerson[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; people: DmPerson[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    let stop = false;
    void fetch("/api/dm/threads", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ threads: DmThreadRow[] }>) : null))
      .then((j) => !stop && setRecent(j ? j.threads.slice(0, 16).map((x) => x.other) : []))
      .catch(() => !stop && setRecent([]));
    return () => {
      stop = true;
    };
  }, [open]);

  const key = q.trim();
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/people?q=${encodeURIComponent(key)}`).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { people: DmPerson[] }) : { people: [] };
      if (!stop) setAnswer({ q: key, people: j.people });
    }, 220);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [key]);
  const found = key ? (answer?.q === key ? answer.people : null) : null;

  const toggle = (p: DmPerson) =>
    setPicked((x) => (x.some((y) => y.id === p.id) ? x.filter((y) => y.id !== p.id) : [...x, p]));

  const close = () => {
    setOpen(false);
    setPicked([]);
    setNote("");
    setQ("");
  };

  const send = async () => {
    if (!picked.length) return;
    setBusy(true);
    let last: string | null = null;
    for (const p of picked) {
      const r = await shareToAction(p.username, resourceId, note.trim() || undefined).catch(
        () => null,
      );
      if (!r?.ok) {
        setBusy(false);
        return errorToast(te, r && !r.ok ? (r.code === "FORBIDDEN" ? "dm_closed" : r) : "INTERNAL");
      }
      last = r.data;
    }
    setBusy(false);
    const names = picked.map((p) => p.name.split(" ")[0]).join(", ");
    const one = picked.length === 1 ? last : null;
    close();
    toast.success(t("sent", { name: names }), {
      action: one
        ? { label: t("openChat"), onClick: () => router.push(`/chats/${one}`) }
        : undefined,
    });
  };

  // Only in the browser (the server renders this button too, and has no address bar).
  const link = () =>
    share && typeof window !== "undefined" ? `${window.location.origin}${share.path}` : "";
  const native = async () => {
    try {
      await navigator.share({ title: share?.title, url: link() });
    } catch {
      /* closed by the person */
    }
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(link()).catch(() => null);
    toast.success(t("linkCopied"));
  };
  const canNative = typeof navigator !== "undefined" && "share" in navigator;

  const faces = found ?? recent ?? [];
  return (
    <D.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <D.Trigger asChild>
        <button
          type="button"
          aria-label={t("sendTo")}
          title={t("sendTo")}
          className={cn(
            compact
              ? "text-muted hover:bg-surface-2 hover:text-foreground grid size-7 place-items-center rounded-lg transition-colors"
              : "border-border hover:bg-surface-2 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
            className,
          )}
        >
          <Send className="size-4" />
          {!compact && t("sendTo")}
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <D.Content
          aria-describedby={undefined}
          className="share-sheet bg-surface border-border fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl"
        >
          <span
            aria-hidden
            className="bg-border-strong mx-auto mt-2 h-1 w-10 rounded-full sm:hidden"
          />
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <D.Title className="min-w-0 flex-1 truncate text-base font-semibold">
              {share?.title ?? t("sendTitle")}
            </D.Title>
            <D.Close
              aria-label={t("cancel")}
              className="text-muted hover:bg-surface-2 grid size-8 place-items-center rounded-full"
            >
              <X className="size-4" />
            </D.Close>
          </div>

          <label className="bg-surface-2 focus-within:ring-primary/40 mx-4 flex h-10 items-center gap-2 rounded-full px-3 focus-within:ring-2">
            <Search className="text-muted size-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPeople")}
              aria-label={t("searchPeople")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          {/* People as faces: tap one or several. */}
          <div className="min-h-[7.5rem] px-2 pt-3">
            {recent === null || (key && found === null) ? (
              <div className="grid h-24 place-items-center">
                <Loader2 className="text-muted size-5 animate-spin" />
              </div>
            ) : faces.length === 0 ? (
              <p className="text-muted grid h-24 place-items-center px-6 text-center text-sm">
                {key ? t("noneFound") : t("shareEmpty")}
              </p>
            ) : (
              <ul className="grid max-h-56 grid-cols-4 gap-y-3 overflow-y-auto">
                {faces.map((p) => {
                  const on = picked.some((x) => x.id === p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => toggle(p)}
                        aria-pressed={on}
                        className="flex w-full flex-col items-center gap-1.5 px-1"
                      >
                        <span
                          className={cn(
                            "relative rounded-full transition-transform duration-200",
                            on
                              ? "ring-primary ring-offset-surface scale-95 ring-2 ring-offset-2"
                              : "active:scale-95",
                          )}
                        >
                          <Avatar name={p.name} image={p.image} className="size-14" />
                          {on && (
                            <span className="bg-primary text-primary-foreground ring-surface animate-scale-in absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full ring-2">
                              <Check className="size-3" strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span className="w-full truncate text-center text-xs">
                          {p.name.split(" ")[0]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {picked.length > 0 ? (
            <div className="animate-fade-in border-border mt-3 flex gap-2 border-t px-4 pt-3">
              <input
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void send()}
                placeholder={t("note")}
                aria-label={t("note")}
                className="bg-surface-2 focus:ring-primary/40 h-11 min-w-0 flex-1 rounded-full px-4 text-sm outline-none focus:ring-2"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy}
                className="bg-primary text-primary-foreground inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {picked.length > 1 ? t("sendN", { n: picked.length }) : t("send")}
              </button>
            </div>
          ) : (
            share && (
              // The phone's own share sheet (every app is there) and the link.
              <div className="border-border mt-3 flex flex-wrap justify-center gap-x-10 gap-y-2 border-t px-4 pt-4">
                {share.closed && (
                  <p className="text-muted -mt-1 mb-1 w-full text-center text-xs">
                    {t("shareClosed")}
                  </p>
                )}
                {canNative && (
                  <AppBtn label={t("shareApps")} onClick={() => void native()}>
                    <Share2 className="size-5" />
                  </AppBtn>
                )}
                <AppBtn label={t("copyLink")} onClick={() => void copy()}>
                  <Link2 className="size-5" />
                </AppBtn>
              </div>
            )
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function AppBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-20 flex-col items-center gap-1.5"
    >
      <span className="bg-surface-2 text-foreground grid size-14 place-items-center rounded-full transition-transform duration-200 group-active:scale-90">
        {children}
      </span>
      <span className="text-muted w-full truncate text-center text-xs">{label}</span>
    </button>
  );
}

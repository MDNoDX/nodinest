"use client";
import { Check, Link2, Loader2, Search, Send, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { shareToAction } from "@/app/actions/dm";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { DmPerson, DmThreadRow } from "@/server/dm";

/**
 * "Yuborish": sends an item (mine, or a public card from Media) to someone in
 * Chatlar. The recent conversations come first; the search finds anyone else.
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
  /** A public post's page: it can also go to Telegram, WhatsApp, Instagram… as a link. */
  share?: { path: string; title: string };
}) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<DmPerson[]>([]);
  const [q, setQ] = useState("");
  const [to, setTo] = useState<DmPerson | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stop = false;
    void fetch("/api/dm/threads", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ threads: DmThreadRow[] }>) : null))
      .then((j) => !stop && j && setRecent(j.threads.slice(0, 12).map((x) => x.other)))
      .catch(() => null);
    return () => {
      stop = true;
    };
  }, [open]);

  const [answer, setAnswer] = useState<{ q: string; people: DmPerson[] } | null>(null);
  const key = q.trim();
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/people?q=${encodeURIComponent(key)}`).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { people: DmPerson[] }) : { people: [] };
      if (!stop) setAnswer({ q: key, people: j.people });
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [key]);
  const found = key ? (answer?.q === key ? answer.people : []) : null;

  const send = async () => {
    if (!to) return;
    setBusy(true);
    const r = await shareToAction(to.username, resourceId, note.trim() || undefined).catch(
      () => null,
    );
    setBusy(false);
    if (!r?.ok)
      return errorToast(te, r && !r.ok ? (r.code === "FORBIDDEN" ? "dm_closed" : r) : "INTERNAL");
    setOpen(false);
    setTo(null);
    setNote("");
    setQ("");
    toast.success(t("sent", { name: to.name }), {
      action: { label: t("openChat"), onClick: () => router.push(`/chats/${r.data}`) },
    });
  };

  const list = found ?? recent;
  const link = share && typeof window !== "undefined" ? `${window.location.origin}${share.path}` : "";
  const native = async () => {
    try {
      await navigator.share({ title: share?.title, url: link });
    } catch {
      /* closed by the person */
    }
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(link).catch(() => null);
    toast.success(t("linkCopied"));
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("sendTo")}
        title={t("sendTo")}
        className={cn(
          compact
            ? "text-muted hover:bg-surface-2 hover:text-foreground grid size-7 place-items-center rounded-lg transition-colors"
            : "border-border hover:bg-surface-2 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
          className,
        )}
      >
        <Send className={compact ? "size-3.5" : "size-3.5"} />
        {!compact && t("sendTo")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("sendTitle")} closeLabel={tc("close")}>
          {share && (
            // Other apps: the phone's own share sheet (Telegram, Instagram, WhatsApp…),
            // or straight links where there is none.
            <div className="mb-4 flex flex-wrap gap-2">
              {typeof navigator !== "undefined" && "share" in navigator && (
                <ShareBtn onClick={() => void native()} label={t("shareApps")}>
                  <Share2 className="size-4" />
                </ShareBtn>
              )}
              <ShareBtn
                href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(share.title)}`}
                label="Telegram"
              >
                <span className="text-[13px] font-bold text-[#2aabee]">TG</span>
              </ShareBtn>
              <ShareBtn
                href={`https://wa.me/?text=${encodeURIComponent(`${share.title} ${link}`)}`}
                label="WhatsApp"
              >
                <span className="text-[13px] font-bold text-[#25d366]">WA</span>
              </ShareBtn>
              <ShareBtn onClick={() => void copy()} label={t("copyLink")}>
                <Link2 className="size-4" />
              </ShareBtn>
            </div>
          )}
          <label className="bg-surface-2 focus-within:ring-primary/40 flex h-10 items-center gap-2 rounded-xl px-3 focus-within:ring-2">
            <Search className="text-muted size-4" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPeople")}
              aria-label={t("searchPeople")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          {!found && recent.length > 0 && (
            <p className="text-muted mt-3 text-[11px] font-semibold tracking-wide uppercase">
              {t("recent")}
            </p>
          )}
          <ul className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setTo((x) => (x?.id === p.id ? null : p))}
                  aria-pressed={to?.id === p.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors",
                    to?.id === p.id ? "bg-primary-soft" : "hover:bg-surface-2",
                  )}
                >
                  <Avatar name={p.name} image={p.image} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    <span className="text-muted block truncate text-xs">@{p.username}</span>
                  </span>
                  {to?.id === p.id && <Check className="text-primary size-5" />}
                </button>
              </li>
            ))}
            {found && found.length === 0 && (
              <li className="text-muted px-2 py-3 text-sm">{t("noneFound")}</li>
            )}
          </ul>
          {to && (
            <div className="mt-3 flex gap-2">
              <input
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void send()}
                placeholder={t("note")}
                aria-label={t("note")}
                className="bg-surface-2 focus:ring-primary/40 h-10 min-w-0 flex-1 rounded-xl px-3 text-sm outline-none focus:ring-2"
              />
              <Button onClick={() => void send()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />} {t("send")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShareBtn({
  href,
  onClick,
  label,
  children,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const cls =
    "border-border hover:bg-surface-2 inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children} {label}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children} {label}
    </button>
  );
}

"use client";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  CornerUpLeft,
  Download,
  Forward,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as D, Popover } from "radix-ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { forwardMessagesAction } from "@/app/actions/dm";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import { DEFAULT_QUICK, writeQuickReactions } from "@/lib/quick-reactions";
import type { DmThreadRow } from "@/server/dm";
import { EmojiGrid } from "./emoji-gif";

export type MenuAction =
  "reply" | "copy" | "save" | "pin" | "unpin" | "forward" | "select" | "delete";

/**
 * A message's own little window, like Telegram's: the reactions on top (the
 * arrow opens every emoji, where the row itself can be changed), then what can
 * be done with it. It stays next to the message and moves out of the screen's
 * edge by itself.
 */
export function MessageMenu({
  open,
  onOpenChange,
  align,
  quick,
  myReaction,
  actions,
  onReact,
  onAction,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align: "start" | "end";
  quick: string[];
  myReaction?: string;
  actions: MenuAction[];
  onReact: (emoji: string) => void;
  onAction: (a: MenuAction) => void;
  children: React.ReactNode;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor asChild>{children}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={6}
          collisionPadding={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          // React passes events up through the portal: a slide in the emoji
          // list must not pull the message behind it (swipe to reply).
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="data-[state=open]:animate-scale-in z-[60] flex w-[min(18rem,calc(100vw-1.5rem))] flex-col gap-2 outline-none"
        >
          <MenuBody
            quick={quick}
            myReaction={myReaction}
            actions={actions}
            onReact={onReact}
            onAction={onAction}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Inside the window (made anew each time it opens, so it opens on the short list). */
function MenuBody({
  quick,
  myReaction,
  actions,
  onReact,
  onAction,
}: {
  quick: string[];
  myReaction?: string;
  actions: MenuAction[];
  onReact: (emoji: string) => void;
  onAction: (a: MenuAction) => void;
}) {
  const t = useTranslations("chat");
  const [more, setMore] = useState(false);
  // Changing the row: which place the next emoji goes to (null = not changing).
  const [slot, setSlot] = useState<number | null>(null);
  const editing = slot !== null;
  const icon: Record<MenuAction, React.ReactNode> = {
    reply: <CornerUpLeft className="size-[18px]" />,
    copy: <Copy className="size-[18px]" />,
    save: <Download className="size-[18px]" />,
    pin: <Pin className="size-[18px]" />,
    unpin: <PinOff className="size-[18px]" />,
    forward: <Forward className="size-[18px]" />,
    select: <CheckCircle2 className="size-[18px]" />,
    delete: <Trash2 className="size-[18px]" />,
  };
  // An emoji from the big list: a reaction, or (while changing) the new one
  // for the chosen place; one already in the row swaps places with it.
  const put = (e: string) => {
    if (slot === null) return onReact(e);
    const next = [...quick];
    const was = next.indexOf(e);
    if (was >= 0) next[was] = next[slot];
    next[slot] = e;
    writeQuickReactions(next);
    setSlot((slot + 1) % next.length);
  };
  const box = "bg-surface/95 border-border border shadow-xl backdrop-blur-xl";
  return (
    <>
      {quick.length > 0 && (
        <div className={cn(box, "flex items-center justify-between rounded-full px-1 py-1")}>
          {quick.map((e, i) => (
            <button
              key={e}
              type="button"
              onClick={() => (editing ? setSlot(i) : onReact(e))}
              aria-label={e}
              aria-pressed={editing ? slot === i : myReaction === e}
              className={cn(
                "grid size-8 place-items-center rounded-full text-[20px] transition-transform",
                editing ? "active:scale-90" : "hover:scale-125 active:scale-90",
                !editing && myReaction === e && "bg-primary-soft",
                editing && slot === i && "ring-primary bg-primary-soft scale-110 ring-2",
              )}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setMore((m) => !m);
              setSlot(null);
            }}
            aria-expanded={more}
            aria-label={t("quick.more")}
            title={t("quick.more")}
            className="text-muted hover:text-foreground grid size-8 place-items-center rounded-full"
          >
            <ChevronDown className={cn("size-5 transition-transform", more && "rotate-180")} />
          </button>
        </div>
      )}
      {more ? (
        <div className={cn(box, "flex flex-col overflow-hidden rounded-2xl")}>
          <div className="border-border flex items-center gap-1 border-b px-3 py-1.5">
            <span
              className={cn(
                "text-muted min-w-0 flex-1 text-xs font-semibold",
                editing ? "leading-snug" : "truncate",
              )}
            >
              {editing ? t("quick.hint") : t("quick.title")}
            </span>
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => writeQuickReactions(null)}
                  disabled={quick.join() === DEFAULT_QUICK.join()}
                  aria-label={t("quick.reset")}
                  title={t("quick.reset")}
                  className="text-muted hover:text-foreground grid size-7 shrink-0 place-items-center rounded-full disabled:opacity-40"
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSlot(null)}
                  className="text-primary shrink-0 rounded-full px-2 py-1 text-xs font-semibold"
                >
                  {t("quick.done")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSlot(0)}
                className="text-primary hover:bg-primary-soft inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold"
              >
                <Pencil className="size-3.5" /> {t("quick.edit")}
              </button>
            )}
          </div>
          <div className="h-[min(16rem,45dvh)] overflow-y-auto p-2">
            <EmojiGrid onPick={put} />
          </div>
        </div>
      ) : (
        <ul className={cn(box, "overflow-hidden rounded-2xl py-1")}>
          {actions.map((a, i) => (
            <li
              key={a}
              className={cn(
                // Like Telegram: a thin line before "pin" and before "delete".
                i > 0 &&
                  (a === "pin" || a === "unpin" || a === "delete") &&
                  "border-border border-t",
              )}
            >
              <button
                type="button"
                onClick={() => onAction(a)}
                className={cn(
                  "hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] transition-colors",
                  a === "delete" && "text-danger",
                )}
              >
                {icon[a]} {t(`menu.${a}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Forward: pick one of my talks (searchable); the copies go there with "forwarded from". */
export function ForwardDialog({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const t = useTranslations("chat");
  const te = useTranslations("errors");
  const router = useRouter();
  const [threads, setThreads] = useState<DmThreadRow[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const open = !!ids?.length;

  useEffect(() => {
    if (!open) return;
    let stop = false;
    void fetch("/api/dm/threads", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ threads: DmThreadRow[] }>) : null))
      .then((j) => !stop && setThreads(j?.threads ?? []))
      .catch(() => !stop && setThreads([]));
    return () => {
      stop = true;
    };
  }, [open]);

  const k = q.trim().toLowerCase();
  const shown = (threads ?? []).filter(
    (x) => !k || x.other.name.toLowerCase().includes(k) || x.other.username.includes(k),
  );
  const send = async (to: DmThreadRow) => {
    if (!ids) return;
    setBusy(to.id);
    const r = await forwardMessagesAction(ids, to.id).catch(() => null);
    setBusy(null);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    onClose();
    toast.success(t("forwarded", { name: to.other.name.split(" ")[0] }), {
      action: { label: t("openChat"), onClick: () => router.push(`/chats/${to.id}`) },
    });
  };

  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px]" />
        <D.Content
          aria-describedby={undefined}
          className="bg-surface border-border fixed inset-x-0 bottom-0 z-[70] mx-auto flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl border pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl"
        >
          <D.Title className="px-4 pt-4 pb-2 text-base font-semibold">
            {t("forwardTo", { n: ids?.length ?? 0 })}
          </D.Title>
          <label className="bg-surface-2 mx-4 flex h-10 items-center gap-2 rounded-full px-3">
            <Search className="text-muted size-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPeople")}
              aria-label={t("searchPeople")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <ul className="mt-2 min-h-24 overflow-y-auto px-2">
            {threads === null ? (
              <li className="grid h-24 place-items-center">
                <Loader2 className="text-muted size-5 animate-spin" />
              </li>
            ) : shown.length === 0 ? (
              <li className="text-muted grid h-24 place-items-center text-sm">{t("noneFound")}</li>
            ) : (
              shown.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void send(x)}
                    className="hover:bg-surface-2 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
                  >
                    <Avatar name={x.other.name} image={x.other.image} className="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{x.other.name}</span>
                      <span className="text-muted block truncate text-xs">@{x.other.username}</span>
                    </span>
                    {busy === x.id && <Loader2 className="text-muted size-4 animate-spin" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

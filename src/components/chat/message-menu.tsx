"use client";
import {
  CheckCircle2,
  Copy,
  CornerUpLeft,
  Download,
  Forward,
  Loader2,
  Pin,
  PinOff,
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
import type { DmThreadRow } from "@/server/dm";
import { EmojiGif } from "./emoji-gif";

export type MenuAction =
  "reply" | "copy" | "save" | "pin" | "unpin" | "forward" | "select" | "delete";

/**
 * A message's own little window, like Telegram's: the reactions on top (the
 * arrow opens every emoji), then what can be done with it. It stays next to
 * the message and moves out of the screen's edge by itself.
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
  const t = useTranslations("chat");
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
          className="animate-scale-in z-[60] flex w-[min(17rem,calc(100vw-1.5rem))] flex-col gap-2 outline-none"
        >
          {onReact && quick.length > 0 && (
            <div className="bg-surface/95 border-border flex items-center justify-between rounded-full border px-1 py-1 shadow-xl backdrop-blur-xl">
              {quick.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onReact(e)}
                  aria-label={e}
                  aria-pressed={myReaction === e}
                  className={cn(
                    "grid size-8 place-items-center rounded-full text-[20px] transition-transform hover:scale-125 active:scale-90",
                    myReaction === e && "bg-primary-soft",
                  )}
                >
                  {e}
                </button>
              ))}
              <EmojiGif onEmoji={onReact} className="size-8" />
            </div>
          )}
          <ul className="bg-surface/95 border-border overflow-hidden rounded-2xl border py-1 shadow-xl backdrop-blur-xl">
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
        <D.Overlay className="animate-fade-in fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px]" />
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

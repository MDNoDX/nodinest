"use client";
import { BookmarkPlus, Check, Clock3, Play, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { DropdownMenu as M } from "radix-ui";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { removeRecordAction, setStatusAction } from "@/app/actions/personal";
import { cn } from "@/lib/cn";
import { MEDIA_LIKE, type ResourceType } from "@/lib/validation";

type Status = "planned" | "in_progress" | "completed";

/** Ribbon colour + icon per state (identity colours, always paired with an icon + label). */
const LOOK: Record<Status | "none", { bg: string; icon: typeof Check }> = {
  none: { bg: "bg-black/55 hover:bg-black/70", icon: Plus },
  planned: { bg: "bg-[var(--c-amber)]", icon: Clock3 },
  in_progress: { bg: "bg-[var(--c-blue)]", icon: Play },
  completed: { bg: "bg-[var(--c-emerald)]", icon: Check },
};

/**
 * IMDb-style corner ribbon on a cover: shows at a glance whether you have
 * read/watched it, are on it now, or planned it — and changes it in
 * one click. Sits OUTSIDE the cover link (no nested interactive elements).
 */
export function StatusRibbon({
  resourceId,
  type,
  status,
  progress,
  className,
}: {
  resourceId: string;
  type: ResourceType;
  status: string | null;
  progress?: number | null;
  className?: string;
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const initial = (
    status === "abandoned" || status === "paused" ? "in_progress" : status
  ) as Status | null;
  const [shown, setShown] = useOptimistic<Status | null>(initial);
  const media = MEDIA_LIKE.includes(type);
  const label = (s: Status) => (media ? t(`statusMedia.${s}`) : t(`status.${s}`));
  const look = LOOK[shown ?? "none"];
  const Icon = look.icon;

  const choose = (s: Status | null) =>
    start(async () => {
      setShown(s);
      const r = s ? await setStatusAction(resourceId, s) : await removeRecordAction(resourceId);
      if (!r.ok) toast.error(t(`errors.${r.code}`));
      else toast.success(s ? label(s) : t("status.removed"));
    });

  return (
    <M.Root>
      <M.Trigger asChild>
        <button
          type="button"
          aria-label={shown ? `${label(shown)} — ${t("status.change")}` : t("status.add")}
          title={shown ? label(shown) : t("status.add")}
          className={cn(
            "absolute top-0 left-2 z-10 flex w-8 flex-col items-center pt-1.5 pb-3 text-white shadow-md transition-[background,transform] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-95",
            "[clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)]",
            look.bg,
            pending && "opacity-70",
            className,
          )}
        >
          <Icon className="size-4" strokeWidth={shown === "completed" ? 3 : 2.25} />
          {shown === "in_progress" && progress != null && (
            <span className="mt-0.5 text-[9px] leading-none font-bold tabular-nums">
              {progress}%
            </span>
          )}
        </button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="start"
          sideOffset={4}
          className="border-border bg-surface animate-scale-in z-50 w-52 rounded-xl border p-1.5 shadow-xl"
        >
          {(["planned", "in_progress", "completed"] as Status[]).map((s) => {
            const L = LOOK[s];
            const SIcon = L.icon;
            return (
              <M.Item
                key={s}
                onSelect={() => choose(s)}
                className="data-[highlighted]:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none"
              >
                <span className={cn("grid size-5 place-items-center rounded text-white", L.bg)}>
                  <SIcon className="size-3" strokeWidth={2.5} />
                </span>
                <span className="flex-1">{label(s)}</span>
                {shown === s && <Check className="text-primary size-4" />}
              </M.Item>
            );
          })}
          {shown && (
            <>
              <M.Separator className="bg-border my-1 h-px" />
              <M.Item
                onSelect={() => choose(null)}
                className="text-muted data-[highlighted]:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none"
              >
                <X className="size-4" /> {t("status.removeFromLibrary")}
              </M.Item>
            </>
          )}
          {!shown && (
            <p className="text-muted flex items-center gap-1.5 px-2 pt-1 pb-0.5 text-[11px]">
              <BookmarkPlus className="size-3" /> {t("status.ribbonHint")}
            </p>
          )}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

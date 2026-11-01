"use client";
import {
  BellOff,
  BookPlus,
  CalendarClock,
  Check,
  Flag,
  LineChart,
  Megaphone,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { deleteNotificationsAction, markReadAction } from "@/app/actions/notifications";
import { answerFollowRequestAction } from "@/app/actions/social";
import { FollowButton } from "@/components/social/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";

export type Note = {
  id: string;
  kind: string;
  body: string | null;
  href: string | null;
  unread: boolean;
  when: string;
  actor: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    profilePublic: boolean;
  } | null;
  following: boolean;
  requested: boolean;
};
type Req = { id: string; name: string; username: string; image: string | null };

const ICON: Record<string, typeof UserPlus> = {
  follow: UserPlus,
  follow_request: UserPlus,
  follow_accepted: UserCheck,
  copied: BookPlus,
  goal_soon: CalendarClock,
  goal_due: Flag,
  weekly: LineChart,
  news: Megaphone,
};

/** Requests to answer, then everything else, newest first. */
export function NotificationCenter({ notes, requests }: { notes: Note[]; requests: Req[] }) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const { exec, pending } = useAction();
  const [hidden, setHidden] = useState<string[]>([]);
  const list = notes.filter((n) => !hidden.includes(n.id));
  useEffect(() => {
    if (notes.some((n) => n.unread))
      void markReadAction()
        .then(() => router.refresh())
        .catch(() => null);
  }, [notes, router]);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {requests.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t("requests", { n: requests.length })}</h2>
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 p-3">
                <Link href={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={r.name} image={r.image} className="size-10" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="text-muted block truncate text-xs">@{r.username}</span>
                  </span>
                </Link>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => exec(() => answerFollowRequestAction(r.id, true))}
                >
                  <Check /> {t("accept")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={t("decline")}
                  title={t("decline")}
                  onClick={() => exec(() => answerFollowRequestAction(r.id, false))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {list.length === 0 && requests.length === 0 ? (
        <EmptyState icon={<BellOff />} title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((n) => {
            const Icon = ICON[n.kind] ?? Megaphone;
            const inner = (
              <>
                {n.actor ? (
                  <Avatar name={n.actor.name} image={n.actor.image} className="size-10 shrink-0" />
                ) : (
                  <span className="bg-primary-soft text-primary grid size-10 shrink-0 place-items-center rounded-full">
                    <Icon className="size-[18px]" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {t(`kind.${n.kind}` as "kind.follow", { name: n.actor?.name ?? "" })}
                  </span>
                  {n.body && (
                    <span className="text-muted mt-0.5 line-clamp-3 block text-sm whitespace-pre-line">
                      {n.body}
                    </span>
                  )}
                  <span className="text-muted mt-0.5 block text-xs">{n.when}</span>
                </span>
              </>
            );
            const href = n.href ?? (n.actor?.username ? `/u/${n.actor.username}` : null);
            return (
              <li
                key={n.id}
                className={cn(
                  "group hover:bg-surface-2 flex items-center gap-1 rounded-xl pr-1 transition-colors",
                  n.unread && "bg-primary-soft/50",
                )}
              >
                {href ? (
                  <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 p-2.5">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3 p-2.5">{inner}</div>
                )}
                {n.kind === "follow" && n.actor && !n.following && (
                  <FollowButton
                    userId={n.actor.id}
                    initial={false}
                    requested={n.requested}
                    locked={!n.actor.profilePublic}
                    size="sm"
                  />
                )}
                <button
                  type="button"
                  aria-label={t("remove")}
                  title={t("remove")}
                  onClick={() => {
                    setHidden((h) => [...h, n.id]);
                    void deleteNotificationsAction([n.id]).catch(() => null);
                  }}
                  className="text-muted hover:text-danger rounded-md p-2 transition-opacity lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

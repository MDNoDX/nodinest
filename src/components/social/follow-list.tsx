"use client";
import { Lock, UserMinus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { removeFollowerAction } from "@/app/actions/social";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";
import { FollowButton } from "./follow-button";

type Row = {
  id: string;
  name: string;
  username: string;
  image: string | null;
  premium: boolean;
  isFollowing: boolean;
  visible: boolean;
};

/**
 * Followers / following of a profile. On my own followers list each row can be
 * removed; on any list I can follow or unfollow (public profiles).
 */
export function FollowList({
  rows,
  me,
  removable,
}: {
  rows: Row[];
  me: string;
  /** My own followers: each one can be removed. */
  removable: boolean;
}) {
  const t = useTranslations("social");
  const [gone, setGone] = useState<string[]>([]);
  const { pending, exec } = useAction();
  return (
    <ul className="card divide-border divide-y">
      {rows
        .filter((r) => !gone.includes(r.id))
        .map((r) => (
          <li key={r.id} className="flex items-center gap-3 p-3">
            <Link href={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={r.name} image={r.image} className="size-11" />
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate font-semibold">
                  {r.name} {r.premium && <PremiumBadge />}
                  {!r.visible && <Lock className="text-muted size-3.5" />}
                </span>
                <span className="text-muted block truncate text-xs">@{r.username}</span>
              </span>
            </Link>
            {r.id !== me && r.visible && (
              <FollowButton userId={r.id} initial={r.isFollowing} size="sm" />
            )}
            {removable && (
              <Button
                size="sm"
                variant="ghost"
                loading={pending}
                onClick={() => {
                  if (!window.confirm(t("removeFollowerConfirm", { name: r.name }))) return;
                  exec(() => removeFollowerAction(r.id), {
                    success: t("removed"),
                    onSuccess: () => setGone((g) => [...g, r.id]),
                  });
                }}
              >
                <UserMinus /> {t("removeFollower")}
              </Button>
            )}
          </li>
        ))}
    </ul>
  );
}

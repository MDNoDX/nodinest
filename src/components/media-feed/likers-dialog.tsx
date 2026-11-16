"use client";
import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { likersAction } from "@/app/actions/social";
import { FollowButton } from "@/components/social/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { normalizeText } from "@/lib/normalize";
import type { Liker } from "@/server/activity";

/** Who liked a post or a comment (like Instagram's likes list): search, profile links, follow. */
export function LikersDialog({
  kind,
  id,
  open,
  onOpenChange,
}: {
  kind: "post" | "comment";
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("media");
  const [list, setList] = useState<Liker[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    let stop = false;
    void likersAction(kind, id).then((r) => {
      if (!stop) setList(r.ok ? r.data : []);
    });
    return () => {
      stop = true;
      setList(null);
      setQ("");
    };
  }, [open, kind, id]);
  const k = normalizeText(q.replace(/^@/, ""));
  const shown = (list ?? []).filter(
    (p) => !k || normalizeText(p.name).includes(k) || p.username.toLowerCase().includes(k),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={kind === "post" ? t("likers") : t("commentLikers")}
        className="flex max-w-md flex-col"
      >
        {list && list.length > 6 && (
          <label className="bg-surface-2 mb-3 flex items-center gap-2 rounded-xl px-3">
            <Search className="text-muted size-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchLikers")}
              aria-label={t("searchLikers")}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
        {list === null ? (
          <Loader2 className="text-muted mx-auto my-6 size-5 animate-spin" />
        ) : shown.length === 0 ? (
          <p className="text-muted py-6 text-center text-sm">
            {list.length ? t("noMatch") : t("nobodyLiked")}
          </p>
        ) : (
          <ul className="-mx-2 flex max-h-[60dvh] flex-col overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Link
                  href={`/u/${p.username}`}
                  onClick={() => onOpenChange(false)}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar name={p.name} image={p.image} className="size-10" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.username}</span>
                    <span className="text-muted block truncate text-xs">
                      {p.me ? t("you") : p.name}
                    </span>
                  </span>
                </Link>
                {!p.me && (
                  <FollowButton
                    userId={p.id}
                    initial={p.isFollowing}
                    requested={p.requested}
                    locked={p.locked}
                    size="sm"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

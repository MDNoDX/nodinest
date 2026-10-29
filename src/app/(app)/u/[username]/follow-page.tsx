import { ArrowLeft, Lock, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FollowList } from "@/components/social/follow-list";
import { EmptyState } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { followList, profileByUsername } from "@/server/social";

/** /u/<username>/followers and /following (one page, two lists). */
export async function FollowPage({
  params,
  which,
}: {
  params: Promise<{ username: string }>;
  which: "followers" | "following";
}) {
  const { username } = await params;
  const { ctx } = await pageContext();
  const t = await getTranslations("social");
  const p = await profileByUsername(ctx, decodeURIComponent(username));
  if (!p) notFound();
  const rows = p.visible ? await followList(ctx, p.id, which) : [];
  const tab = (w: typeof which, label: string, n: number) => (
    <Link
      href={`/u/${p.username}/${w}`}
      aria-current={which === w ? "page" : undefined}
      className={
        which === w
          ? "border-primary text-foreground -mb-px border-b-2 px-3 py-2 text-sm font-semibold"
          : "text-muted hover:text-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium"
      }
    >
      {label} <span className="tabular-nums">{n}</span>
    </Link>
  );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        href={`/u/${p.username}`}
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> {p.name} · @{p.username}
      </Link>
      <nav className="border-border flex gap-1 border-b">
        {tab("followers", t("followersTitle"), p.followers)}
        {tab("following", t("followingListTitle"), p.following)}
      </nav>
      {!p.visible ? (
        <EmptyState icon={<Lock />} title={t("privateTitle")} body={t("listPrivate")} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={which === "followers" ? t("noFollowers") : t("noFollowing")}
        />
      ) : (
        <FollowList rows={rows} me={ctx.userId} removable={p.self && which === "followers"} />
      )}
    </div>
  );
}

import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { FollowButton } from "@/components/social/follow-button";
import { ItemGrid } from "@/components/social/item-grid";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { profileByUsername, publicItems } from "@/server/social";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  return { title: `@${(await params).username}` };
}

/** /u/<username>: someone's public profile and public library. */
export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { ctx } = await pageContext();
  const t = await getTranslations("social");
  const p = await profileByUsername(ctx, decodeURIComponent(username));
  if (!p) notFound();
  const items = p.visible ? await publicItems(ctx, p.id) : [];
  return (
    <div className="flex flex-col gap-8">
      <header className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <Avatar name={p.name} image={p.image} className="size-20 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight">
            {p.name} {p.premium && <PremiumBadge className="size-5" />}
          </h1>
          <p className="text-muted">@{p.username}</p>
          {p.bio && <p className="mt-2 max-w-xl text-sm leading-relaxed">{p.bio}</p>}
          <p className="text-muted mt-2 text-sm">
            {t("followersN", { n: p.followers })} · {t("followingN", { n: p.following })} ·{" "}
            {t("itemsN", { n: items.length })}
          </p>
        </div>
        {p.self ? (
          <Button asChild variant="outline">
            <Link href="/settings#profile">{t("editProfile")}</Link>
          </Button>
        ) : p.visible ? (
          <FollowButton userId={p.id} initial={p.isFollowing} />
        ) : null}
      </header>
      {!p.visible ? (
        <EmptyState icon={<Lock />} title={t("privateTitle")} body={t("privateBody")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("noPublic")} body={p.self ? t("noPublicSelf") : undefined} />
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("library")}</h2>
          <ItemGrid items={items} />
        </section>
      )}
      {p.self && !p.profilePublic && <p className="text-muted text-sm">{t("selfPrivateNote")}</p>}
    </div>
  );
}

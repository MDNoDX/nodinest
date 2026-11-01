import {
  BookOpen,
  ChevronRight,
  Clock3,
  Eye,
  GraduationCap,
  Lock,
  Play,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { FollowButton } from "@/components/social/follow-button";
import { ItemGrid } from "@/components/social/item-grid";
import { Avatar } from "@/components/ui/avatar";
import { ProfileEditor } from "@/components/social/profile-editor";
import { isStorageConfigured } from "@/server/storage";
import { EmptyState } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import {
  followingList,
  myItemsCount,
  profileByUsername,
  profileStats,
  publicItems,
} from "@/server/social";
import { PersonCard } from "@/components/social/person-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  return { title: `@${(await params).username}` };
}

/** /u/<username>: someone's public profile and public library. */
export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { ctx, user } = await pageContext();
  const t = await getTranslations("social");
  const name = decodeURIComponent(username).toLowerCase();
  // My own page: everything is asked for at once (no waiting in turn).
  const mine = name === user.username?.toLowerCase();
  const [p, following, myItems, ownItems] = await Promise.all([
    profileByUsername(ctx, name),
    mine ? followingList(ctx) : Promise.resolve([]),
    mine ? myItemsCount(ctx) : Promise.resolve(0),
    mine ? publicItems(ctx, user.id) : Promise.resolve(null),
  ]);
  if (!p) notFound();
  const [items, done] = await Promise.all([
    ownItems ?? (p.visible ? publicItems(ctx, p.id) : Promise.resolve([])),
    p.visible ? profileStats(ctx, p.id) : Promise.resolve(null),
  ]);
  const stat = (n: number, label: string, href?: string) => {
    const body = (
      <>
        <span className="block text-2xl font-bold tracking-tight tabular-nums">{n}</span>
        <span className="text-muted block text-xs font-medium">{label}</span>
      </>
    );
    return href ? (
      <Link
        href={href}
        className="hover:bg-surface-2 flex-1 rounded-xl px-3 py-2 text-center transition-colors"
      >
        {body}
      </Link>
    ) : (
      <div className="flex-1 rounded-xl px-3 py-2 text-center">{body}</div>
    );
  };
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="card overflow-hidden">
        {/* A soft cover: warm for Premium readers */}
        <div
          aria-hidden
          className={
            p.premium
              ? "h-24 bg-gradient-to-r from-amber-400/70 via-orange-500/60 to-rose-500/60 sm:h-32"
              : "h-24 bg-gradient-to-r from-indigo-500/50 via-violet-500/40 to-sky-500/40 sm:h-32"
          }
        />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-7">
          <Avatar
            name={p.name}
            image={p.image}
            className="ring-surface -mt-12 size-24 text-3xl ring-4 sm:-mt-14 sm:size-28"
          />
          <div className="min-w-0 flex-1 pt-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="truncate">{p.name}</span>
              {p.premium && <PremiumBadge className="size-6" />}
            </h1>
            <p className="text-muted">@{p.username}</p>
          </div>
          {p.self ? (
            <ProfileEditor
              userId={user.id}
              storage={isStorageConfigured()}
              initial={{
                firstName: user.firstName ?? user.name,
                lastName: user.lastName ?? "",
                username: user.username ?? "",
                image: user.image,
                phone: user.phone ?? "",
              }}
              profilePublic={user.profilePublic}
              bio={user.bio}
            />
          ) : (
            <FollowButton
              userId={p.id}
              initial={p.isFollowing}
              requested={p.requested}
              locked={!p.profilePublic}
            />
          )}
        </div>
        {p.bio && (
          <p className="max-w-2xl px-5 pb-4 text-sm leading-relaxed whitespace-pre-line sm:px-7">
            {p.bio}
          </p>
        )}
        <div className="border-border mx-5 mb-5 flex divide-x divide-[var(--border)] rounded-2xl border sm:mx-7">
          {stat(items.length, t("statItems"))}
          {stat(p.followers, t("statFollowers"), `/u/${p.username}/followers`)}
          {stat(p.following, t("statFollowing"), `/u/${p.username}/following`)}
        </div>
        {done && (
          <div className="mx-5 mb-5 grid grid-cols-2 gap-2 sm:mx-7 sm:grid-cols-4">
            {(
              [
                [done.books, t("statBooks"), BookOpen, "var(--c-blue)"],
                [done.videos + done.audio, t("statVideos"), Play, "var(--c-rose)"],
                [done.courses, t("statCourses"), GraduationCap, "var(--c-teal)"],
                [done.hours, t("statHours"), Clock3, "var(--c-amber)"],
              ] as const
            ).map(([n, label, Icon, color]) => (
              <div key={label} className="bg-surface-2 flex items-center gap-2.5 rounded-xl p-3">
                <Icon className="size-5 shrink-0" style={{ color }} />
                <span className="min-w-0">
                  <span className="block text-lg leading-tight font-bold tabular-nums">{n}</span>
                  <span className="text-muted block truncate text-xs">{label}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </header>

      {!p.visible ? (
        <EmptyState icon={<Lock />} title={t("privateTitle")} body={t("privateBody")} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={t("noPublic")}
          body={p.self ? t("noPublicSelf") : undefined}
        />
      ) : (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="text-muted size-4" /> {t("library")}
            </h2>
            {items.length > 5 && (
              <Link
                href={`/u/${p.username}/items`}
                className="text-primary text-sm font-medium hover:underline"
              >
                {t("showAllN", { n: items.length })}
              </Link>
            )}
          </div>
          <ItemGrid items={items.slice(0, 5)} owner={p.self ? undefined : p.username} />
        </section>
      )}
      {p.self && myItems > 0 && (
        <Link
          href={`/u/${p.username}/items`}
          className="card hover:border-border-strong flex items-center gap-3 p-4 transition-colors"
        >
          <Eye className="size-5 text-[var(--c-emerald)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("whatOthersSee")}</span>
            <span className="text-muted block text-xs">
              {t("whatOthersSeeHint", { open: items.length, total: myItems })}
            </span>
          </span>
          <ChevronRight className="text-muted size-4" />
        </Link>
      )}
      {p.self && !p.profilePublic && (
        <p className="bg-surface-2 text-muted flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <Lock className="size-4 shrink-0" /> {t("selfPrivateNote")}
        </p>
      )}
      {p.self && (
        <Link
          href="/settings"
          className="card hover:border-border-strong flex items-center gap-3 p-4 transition-colors"
        >
          <Settings className="text-muted size-5" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("manageAccount")}</span>
            <span className="text-muted block text-xs">{t("manageAccountHint")}</span>
          </span>
          <ChevronRight className="text-muted size-4" />
        </Link>
      )}
      {p.self && following.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("followingTitle")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {following.map((f) => (
              <li key={f.id}>
                <PersonCard p={f} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { MediaFeed } from "@/components/media-feed/feed";
import { FollowButton } from "@/components/social/follow-button";
import { PeopleSearch } from "@/components/social/people-search";
import { Avatar } from "@/components/ui/avatar";
import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { pageContext, sp, type SP } from "@/lib/page";
import { mediaFeed, myFollowRequests, ranking } from "@/server/social";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("media"))("title") };
}

export default async function MediaPage({ searchParams }: { searchParams: SP }) {
  const { ctx } = await pageContext();
  const t = await getTranslations("media");
  const q = await searchParams;
  const scope = sp(q.scope) === "following" ? "following" : "all";
  const kind = sp(q.kind) || "all";
  const [items, asked, top] = await Promise.all([
    mediaFeed(ctx, { scope, kind }),
    myFollowRequests(ctx),
    ranking(),
  ]);
  return (
    <>
      <PageHeader title={t("title")} />
      <section aria-label={t("findPeople")} className="mb-4 flex flex-col gap-3">
        <PeopleSearch />
        {asked.length > 0 && (
          <div className="card p-3">
            <h3 className="text-muted mb-2 text-xs font-semibold">{t("waiting")}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {asked.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Link
                    href={`/u/${p.username}`}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <Avatar name={p.name} image={p.image} className="size-9" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="text-muted block truncate text-xs">@{p.username}</span>
                    </span>
                  </Link>
                  <FollowButton userId={p.id} initial={false} requested locked size="sm" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {top.length > 1 && (
        <section aria-label={t("ranking")} className="mb-4">
          <h2 className="text-muted mb-2 text-xs font-semibold">{t("ranking")}</h2>
          <ol className="flex gap-2 overflow-x-auto pb-1">
            {top.map((p, i) => (
              <li key={p.id} className="shrink-0">
                <Link
                  href={`/u/${p.username}`}
                  className="card hover:border-border-strong flex items-center gap-2 py-2 pr-3 pl-2 transition-colors"
                >
                  <span className="text-muted w-4 text-center text-xs font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <Avatar name={p.name} image={p.image} className="size-7" />
                  <span className="min-w-0">
                    <span className="block max-w-28 truncate text-xs font-semibold">{p.name}</span>
                    <span className="text-muted block text-[11px] tabular-nums">
                      {t("rankDone", { n: p.done })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
      <MediaFeed key={`${scope}-${kind}`} items={[...items]} scope={scope} kind={kind} />
    </>
  );
}

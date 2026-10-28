import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ItemGrid } from "@/components/social/item-grid";
import { PersonCard } from "@/components/social/person-card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { pageContext, sp, type SP } from "@/lib/page";
import { followingFeed, followingList, searchPeople } from "@/server/social";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("social"))("title") };
}

/** People: find public profiles, the people I follow and what they read lately. */
export default async function CommunityPage({ searchParams }: { searchParams: SP }) {
  const q = sp((await searchParams).q) ?? "";
  const { ctx, user } = await pageContext();
  const t = await getTranslations("social");
  const [found, mine, feed] = await Promise.all([
    q ? searchPeople(ctx, q) : Promise.resolve([]),
    followingList(ctx),
    followingFeed(ctx),
  ]);
  return (
    <>
      <PageHeader section="community" title={t("title")} subtitle={t("subtitle")} />
      <div className="flex flex-col gap-8">
        <form className="relative max-w-xl" action="/community">
          <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="pl-9" />
        </form>
        {q && (
          <section>
            <h2 className="mb-3 text-sm font-semibold">{t("results")}</h2>
            {found.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {found.map((p) => (
                  <li key={p.id}>
                    <PersonCard p={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">{t("nobody")}</p>
            )}
          </section>
        )}
        {!user.username ? null : (
          <p className="text-muted text-sm">
            {t("yourProfile")}{" "}
            <a href={`/u/${user.username}`} className="text-primary font-medium hover:underline">
              @{user.username}
            </a>
          </p>
        )}
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("feed")}</h2>
          {feed.length ? (
            <ItemGrid items={feed} by />
          ) : (
            <EmptyState title={t("feedEmpty")} body={t("feedEmptyBody")} />
          )}
        </section>
        {mine.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold">{t("followingTitle")}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((p) => (
                <li key={p.id}>
                  <PersonCard p={p} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

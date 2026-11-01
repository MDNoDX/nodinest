import { getTranslations } from "next-intl/server";
import { UserSearch } from "lucide-react";
import { MediaFeed } from "@/components/media-feed/feed";
import { PeopleSearch } from "@/components/social/people-search";
import { PageHeader } from "@/components/ui/misc";
import { pageContext, sp, type SP } from "@/lib/page";
import { mediaFeed } from "@/server/social";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("media"))("title") };
}

export default async function MediaPage({ searchParams }: { searchParams: SP }) {
  const { ctx } = await pageContext();
  const t = await getTranslations("media");
  const kind = sp((await searchParams).kind) || "all";
  const items = await mediaFeed(ctx, { kind });
  return (
    <>
      <PageHeader title={t("title")} />
      <section className="card mb-5 flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <UserSearch className="size-5 text-[var(--c-violet)]" /> {t("findPeople")}
        </h2>
        <PeopleSearch />
      </section>
      <MediaFeed key={kind} items={[...items]} kind={kind} />
    </>
  );
}

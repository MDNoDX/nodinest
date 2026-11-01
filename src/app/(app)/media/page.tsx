import { getTranslations } from "next-intl/server";
import { MediaFeed } from "@/components/media-feed/feed";
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
      <MediaFeed key={kind} items={[...items]} kind={kind} />
    </>
  );
}

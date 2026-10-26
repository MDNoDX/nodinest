import { getTranslations } from "next-intl/server";
import { ReviewApp } from "@/components/review/review-app";
import { PageHeader } from "@/components/ui/misc";
import { pageContext, sp, type SP } from "@/lib/page";
import { listDecks } from "@/server/study-cards";

export const dynamic = "force-dynamic";
// Making questions with the AI runs as a server action from this page.
// Deep question sets read and check the material in several passes.
export const maxDuration = 300;

export async function generateMetadata() {
  return { title: (await getTranslations("review"))("title") };
}

export default async function ReviewPage({ searchParams }: { searchParams: SP }) {
  const { ctx } = await pageContext();
  const t = await getTranslations("review");
  const p = await searchParams;
  const decks = await listDecks(ctx);
  return (
    <>
      <PageHeader section="review" title={t("title")} subtitle={t("subtitle")} />
      <ReviewApp
        decks={decks.map((d) => ({
          deck: d.deck,
          total: d.total,
          due: d.due,
          learned: d.learned,
          resourceId: d.resource_id,
        }))}
        openDeck={sp(p.deck)?.slice(0, 120) ?? null}
        preselect={sp(p.resource) ?? null}
      />
    </>
  );
}

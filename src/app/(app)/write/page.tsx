import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/misc";
import { WriteHome } from "@/components/write/write-home";
import { pageContext } from "@/lib/page";
import { listOwnBooks } from "@/server/own-books";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("write"))("title") };
}

export default async function WritePage() {
  const { ctx, user } = await pageContext();
  const t = await getTranslations("write");
  const books = await listOwnBooks(ctx);
  return (
    <>
      <PageHeader section="write" title={t("title")} subtitle={t("subtitle")} />
      <WriteHome
        author={user.name}
        books={books.map((b) => ({ ...b, updatedAt: b.updatedAt.toISOString() }))}
      />
    </>
  );
}

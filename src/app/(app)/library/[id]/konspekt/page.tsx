import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { KonspektEditor } from "@/components/konspekt/konspekt-editor";
import { coverSrc } from "@/components/library/cover";
import { pageContext, sp, type SP } from "@/lib/page";
import { getResourceDetail } from "@/server/catalog";
import { listSections } from "@/server/conspect";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getTranslations("konspekt"))("title") };
}

export default async function KonspektPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db } = await pageContext();
  const [d, sections] = await Promise.all([
    getResourceDetail(db, ctx, id),
    listSections(db, ctx, id),
  ]);
  if (!d) notFound();
  const selected = sp((await searchParams).s) ?? null;
  return (
    <KonspektEditor
      resource={{
        id,
        title: d.resource.title,
        type: d.resource.type,
        cover: coverSrc(d.resource),
        authors: d.contributors.map((c) => c.fullName).join(", "),
      }}
      initialSections={sections.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        pageFrom: s.pageFrom,
        pageTo: s.pageTo,
      }))}
      initialSelected={selected}
    />
  );
}

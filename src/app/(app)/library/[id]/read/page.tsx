import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { ReaderApp } from "@/components/reader/reader-app";
import { pageContext, sp, type SP } from "@/lib/page";
import { getResourceHeader } from "@/server/catalog";
import { findStructure, needsStructure } from "@/server/book-structure";
import { getReaderData } from "@/server/reader";

export const dynamic = "force-dynamic";
// The chapters of a new book are found after the first response (after()).
export const maxDuration = 180;

export async function generateMetadata() {
  return { title: (await getTranslations("reader"))("title") };
}

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db } = await pageContext();
  const [r, data, q] = await Promise.all([
    getResourceHeader(db, ctx, id),
    getReaderData(ctx, id),
    searchParams,
  ]);
  if (!r) notFound();
  // No text yet: the PDF is added on the resource page.
  if (!data) redirect(`/library/${id}#reading`);
  // First visit: find the chapters in the background; the page refreshes itself.
  const preparing =
    !data.scanned && (needsStructure(data.structure) || data.structure?.source === "pending");
  if (!data.scanned && needsStructure(data.structure)) {
    const locale = (await getLocale()) === "en" ? "en" : "uz";
    after(() => findStructure(ctx, id, locale).catch(() => null));
  }
  const asked = Number(sp(q.page));
  const want = asked >= 1 ? asked : (data.lastPage ?? data.structure?.startPage ?? 1);
  // The first page with text at or after the wanted one.
  const start = data.pages.find((p) => p >= want) ?? data.pages.at(-1) ?? 1;
  return (
    <ReaderApp
      resource={{ id, title: r.title, authors: r.authors ?? "" }}
      data={data}
      start={start}
      preparing={preparing}
    />
  );
}

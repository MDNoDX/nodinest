import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ReaderApp } from "@/components/reader/reader-app";
import { pageContext, sp, type SP } from "@/lib/page";
import { getReaderData } from "@/server/reader";
import { publicItem, sharedTextOwner } from "@/server/social";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getTranslations("reader"))("title") };
}

/**
 * Reading a book whose owner made its text public: the owner's pages, read-only
 * (never their quotes, notes or reading place).
 */
export default async function SharedReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; id: string }>;
  searchParams: SP;
}) {
  const { username, id } = await params;
  const { ctx, user } = await pageContext();
  const it = await publicItem(ctx, decodeURIComponent(username), id);
  if (!it || !it.textPublic) notFound();
  if (it.ownerId === user.id) redirect(`/library/${id}/read`);
  const owner = await sharedTextOwner(ctx, it.ownerId, id);
  const data = await getReaderData(owner, id);
  if (!data) notFound();
  const asked = Number(sp((await searchParams).page));
  const total = Math.max(data.totalPages, 1);
  const start = Math.max(1, Math.min(asked >= 1 ? asked : (data.structure?.startPage ?? 1), total));
  return (
    <ReaderApp
      resource={{ id, title: it.title, authors: it.authors ?? "" }}
      data={{ ...data, marks: [], lastPage: null }}
      start={start}
      preparing={false}
      viewer={{ ownerId: it.ownerId, back: `/u/${it.username}/item/${id}` }}
    />
  );
}

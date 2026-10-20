import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { coverSrc } from "@/components/library/cover";
import { TaqrizEditor } from "@/components/taqriz/taqriz-editor";
import { pageContext, sp, type SP } from "@/lib/page";
import { getResourceHeader } from "@/server/catalog";
import { getOwnBook } from "@/server/own-books";
import { getResume } from "@/server/resume";
import { getWriteup } from "@/server/writeups";

export const dynamic = "force-dynamic";
// AI writing, interview and listening run as server actions from this page.
export const maxDuration = 120;

export async function generateMetadata() {
  return { title: (await getTranslations("write"))("title") };
}

/** Writing studio for one of the user's own books (the full taqriz editor). */
export default async function OwnBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user } = await pageContext();
  const [book, r, w, resume, aiTab] = await Promise.all([
    getOwnBook(ctx, id),
    getResourceHeader(db, ctx, id),
    getWriteup(db, ctx, id),
    getResume(db, ctx, id),
    searchParams.then((p) => {
      const v = sp(p.ai);
      return v === "write" || v === "ask" || v === "listen" ? v : null;
    }),
  ]);
  if (!book || !r) notFound();
  return (
    <TaqrizEditor
      mode="book"
      goalWords={book.goalWords}
      resource={{
        id,
        title: r.title,
        type: r.type,
        cover: coverSrc(r),
        authors: user.name,
      }}
      media={null}
      initial={{ doc: w?.doc ?? null, updatedAt: w?.updatedAt.toISOString() ?? null }}
      initialAi={aiTab}
      resume={
        resume && {
          docPos: resume.docPos,
          docAnchor: resume.docAnchor,
          media: resume.media,
          mediaSeconds: resume.mediaSeconds,
        }
      }
      userId={user.id}
    />
  );
}

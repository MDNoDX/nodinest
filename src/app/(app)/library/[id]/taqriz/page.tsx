import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { coverSrc } from "@/components/library/cover";
import { TaqrizEditor } from "@/components/taqriz/taqriz-editor";
import { pageContext, sp, type SP } from "@/lib/page";
import { getResourceHeader } from "@/server/catalog";
import { getOwnBook } from "@/server/own-books";
import { getResume } from "@/server/resume";
import { getWriteup } from "@/server/writeups";

export const dynamic = "force-dynamic";
// AI listening / explaining runs as server actions from this page.
export const maxDuration = 120;

export async function generateMetadata() {
  return { title: (await getTranslations("taqriz"))("title") };
}

export default async function TaqrizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user } = await pageContext();
  const [r, w, q, aiTab, resume] = await Promise.all([
    getResourceHeader(db, ctx, id),
    getWriteup(db, ctx, id),
    searchParams.then((p) => sp(p.q)?.slice(0, 100) ?? null),
    searchParams.then((p) => {
      const v = sp(p.ai);
      return v === "write" || v === "ask" || v === "listen" || v === "full" ? v : null;
    }),
    getResume(db, ctx, id),
  ]);
  if (!r) notFound();
  if (await getOwnBook(ctx, id)) redirect(`/write/${id}`);
  return (
    <TaqrizEditor
      resource={{
        id,
        title: r.title,
        type: r.type,
        cover: coverSrc(r),
        authors: r.authors ?? "",
      }}
      media={
        r.youtubeId
          ? { kind: "youtube", id: r.youtubeId, title: r.title, resourceId: id }
          : r.mediaUrl
            ? {
                kind: "file",
                src: r.mediaUrl,
                video: /\.(mp4|webm|mov|m4v)([?#]|$)/i.test(r.mediaUrl),
                title: r.title,
                resourceId: id,
              }
            : null
      }
      initial={{ doc: w?.doc ?? null, updatedAt: w?.updatedAt.toISOString() ?? null }}
      focusQuery={q}
      initialAi={aiTab === "full" ? "listen" : aiTab}
      initialFull={aiTab === "full"}
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

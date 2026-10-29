import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AudiobookApp } from "@/components/audiobook/audiobook-app";
import { coverSrc } from "@/components/library/cover";
import { pageContext } from "@/lib/page";
import { getAudiobook, hasBookText, VOICE_ROLES, VOICES } from "@/server/audiobook";
import { getResourceHeader } from "@/server/catalog";

export const dynamic = "force-dynamic";
// The whole-book analysis runs as a server action from this page.
export const maxDuration = 300;

export async function generateMetadata() {
  return { title: (await getTranslations("audiobook"))("title") };
}

export default async function AudiobookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db } = await pageContext();
  const [r, view, text] = await Promise.all([
    getResourceHeader(db, ctx, id),
    getAudiobook(ctx, id),
    hasBookText(ctx, id),
  ]);
  if (!r) notFound();
  return (
    <AudiobookApp
      resource={{
        id,
        title: r.title,
        type: r.type,
        cover: coverSrc(r),
        authors: r.authors ?? "",
      }}
      view={view}
      hasText={text}
      voices={VOICE_ROLES.map((r) => ({
        name: r.voice,
        female: VOICES[r.voice].g === "f",
        d: VOICES[r.voice].d,
        role: r.role,
      }))}
    />
  );
}

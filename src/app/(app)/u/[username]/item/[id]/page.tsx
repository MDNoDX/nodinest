import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Cover, coverSrc } from "@/components/library/cover";
import { PublicAudio } from "@/components/social/public-audio";
import { TakeButton } from "@/components/social/take-button";
import { DocView } from "@/components/taqriz/doc-view";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { publicExtras, publicItem } from "@/server/social";

export const dynamic = "force-dynamic";

/** Someone's public entry: what it is and how far they got, never their notes. */
export default async function PublicItemPage({
  params,
}: {
  params: Promise<{ username: string; id: string }>;
}) {
  const { username, id } = await params;
  const { ctx, user } = await pageContext();
  const it = await publicItem(ctx, decodeURIComponent(username), id);
  if (!it) notFound();
  if (it.ownerId === user.id) redirect(`/library/${id}`);
  const t = await getTranslations();
  const extra = await publicExtras(it.ownerId, it.resourceId);
  const percent =
    it.progressCurrent && it.progressTotal
      ? Math.min(100, Math.round((it.progressCurrent / it.progressTotal) * 100))
      : null;
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href={`/u/${it.username}`}
        className="text-muted hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        <Avatar name={it.name} image={it.image} className="size-5" /> {it.name}
      </Link>
      <section className="card flex flex-col gap-6 p-5 sm:flex-row sm:p-7">
        <Cover
          type={it.type as "book"}
          title={it.title}
          src={coverSrc(it)}
          size="lg"
          className="self-center sm:self-start"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <p className="text-muted text-xs font-medium">{t(`types.${it.type as "book"}`)}</p>
            <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight">{it.title}</h1>
            {it.authors && <p className="text-muted mt-1 text-sm">{it.authors}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={it.status === "completed" ? "success" : "neutral"}>
              {t(`status.${it.status as "planned"}`)}
            </Badge>
            {it.rating ? <span className="text-muted">★ {it.rating}/10</span> : null}
            {percent != null && <span className="text-muted tabular-nums">{percent}%</span>}
          </div>
          {it.description && (
            <p className="text-sm leading-relaxed whitespace-pre-line">{it.description}</p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <TakeButton resourceId={it.resourceId} ownerId={it.ownerId} mine={it.mine} />
            {it.sourceUrl && /^https?:\/\//.test(it.sourceUrl) && (
              <a
                href={it.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                <ExternalLink className="size-4" /> {t("social.openSource")}
              </a>
            )}
          </div>
        </div>
      </section>
      {extra.parts ? (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="font-semibold">{t("social.sharedAudiobook")}</h2>
          <PublicAudio
            base={`/api/u/${it.username}/item/${it.resourceId}/audio`}
            parts={extra.parts}
          />
        </section>
      ) : null}
      {extra.doc && (
        <section className="card p-5 sm:p-7">
          <h2 className="mb-3 font-semibold">{t("social.sharedWriteup")}</h2>
          <DocView doc={extra.doc} />
        </section>
      )}
    </article>
  );
}

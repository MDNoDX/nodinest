import {
  BookOpenText,
  ExternalLink,
  FileText,
  Lock,
  Quote,
  ScrollText,
  StickyNote,
  Star,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CatalogActions } from "@/components/library/catalog-actions";
import { CollectionPicker } from "@/components/library/collection-picker";
import { Cover, coverSrc } from "@/components/library/cover";
import { ReadingPanel } from "@/components/library/reading-panel";
import { RecordForm } from "@/components/library/record-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, TypeBadge } from "@/components/ui/misc";
import { formatPartialDate } from "@/lib/dates";
import { fmtDate, fmtMinutes } from "@/lib/format";
import { hueFor, hueStyle } from "@/lib/hues";
import { pageContext } from "@/lib/page";
import { MEDIA_LIKE } from "@/lib/validation";
import { listTextSources } from "@/server/booktext";
import { getResourceDetail } from "@/server/catalog";
import { listSections } from "@/server/conspect";
import { collectionsContaining, listCollections } from "@/server/notes";
import { isStorageConfigured, listAttachments } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const { ctx, db } = await pageContext();
  const d = await getResourceDetail(db, ctx, id);
  return { title: d?.resource.title };
}

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user, locale, tz } = await pageContext();
  const t = await getTranslations();
  const storage = isStorageConfigured();
  const [d, cols, inCols, files, sections, sources] = await Promise.all([
    getResourceDetail(db, ctx, id),
    listCollections(db, ctx),
    collectionsContaining(db, ctx, { resourceId: id }),
    storage ? listAttachments(ctx, id) : Promise.resolve([]),
    listSections(db, ctx, id),
    listTextSources(ctx, id),
  ]);
  if (!d) notFound();
  const r = d.resource;
  const isMedia = MEDIA_LIKE.includes(r.type);
  const youtube = d.identifiers.find((i) => i.scheme === "youtube")?.value;
  const facts = [
    r.originalDate && {
      k: t("resource.originalDate"),
      v: formatPartialDate(r.originalDate, locale),
    },
    r.publicationDate && {
      k: t("resource.editionDate"),
      v: formatPartialDate(r.publicationDate, locale),
    },
    d.book?.pageCount && { k: t("resource.pageCount"), v: String(d.book.pageCount) },
    d.media?.durationSeconds && {
      k: t("resource.durationValue"),
      v: fmtMinutes(d.media.durationSeconds, locale),
    },
    d.book?.publisher && { k: t("resource.publisher"), v: d.book.publisher },
    d.media?.channel && { k: t("resource.channel"), v: d.media.channel },
    r.language && { k: t("resource.language"), v: r.language },
  ].filter(Boolean) as { k: string; v: string }[];
  const links = [
    ...(r.sourceUrl
      ? [{ id: "src", kind: "source", url: r.sourceUrl, label: null as string | null }]
      : []),
    ...(d.media?.transcriptUrl
      ? [
          {
            id: "tr",
            kind: "reference",
            url: d.media.transcriptUrl,
            label: t("resource.transcriptUrl"),
          },
        ]
      : []),
    ...d.links,
  ];
  const progressUnit = d.book?.pageCount
    ? "pages"
    : d.media?.durationSeconds
      ? "minutes"
      : "percent";
  const progressTotal =
    d.book?.pageCount ??
    (d.media?.durationSeconds ? Math.round(d.media.durationSeconds / 60) : null);
  const statusKey = (s: string) => (s === "abandoned" ? "paused" : s);
  const statusLabel = (s: string) =>
    isMedia ? t(`statusMedia.${statusKey(s)}`) : t(`status.${statusKey(s)}`);

  return (
    <article>
      {r.deletedAt && (
        <div className="bg-warning-soft text-warning mb-4 rounded-lg px-4 py-2 text-sm">
          {t("resource.archivedBanner")}
        </div>
      )}

      <section className="hero -mx-4 -mt-6 mb-8 rounded-b-3xl px-4 pt-6 pb-7 sm:-mx-6 sm:-mt-8 sm:px-6 sm:pt-8">
        <div className="flex flex-col gap-6 md:flex-row">
          <Cover
            type={r.type}
            title={r.title}
            src={coverSrc(r)}
            size="lg"
            className={isMedia ? "md:w-80" : "shadow-xl"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={r.type} label={t(`types.${r.type}`)} />
              {d.record && (
                <Badge tone={d.record.status === "completed" ? "success" : "primary"}>
                  {statusLabel(d.record.status)}
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              {r.title}
            </h1>
            {r.originalTitle && <p className="text-muted mt-1 italic">{r.originalTitle}</p>}
            {d.contributors.length > 0 && (
              <p className="mt-2 text-[15px]">
                {d.contributors.map((c, i) => (
                  <span key={`${c.id}-${c.role}`}>
                    {i > 0 && ", "}
                    <Link href={`/people/${c.id}`} className="font-semibold hover:underline">
                      {c.fullName}
                    </Link>
                    {c.role !== "author" && (
                      <span className="text-muted text-xs">
                        {" "}
                        ({t(`contributorRoles.${c.role}`)})
                      </span>
                    )}
                  </span>
                ))}
              </p>
            )}
            {d.record?.rating ? (
              <div className="mt-3 flex items-center gap-1.5" aria-label={`${d.record.rating}/10`}>
                <div className="flex text-[var(--c-amber)]">
                  {Array.from({ length: 10 }, (_, i) => (
                    <Star
                      key={i}
                      className={`size-4 ${i < (d.record?.rating ?? 0) ? "fill-current" : "opacity-25"}`}
                    />
                  ))}
                </div>
                <span className="text-sm font-semibold tabular-nums">{d.record.rating}/10</span>
              </div>
            ) : null}
            {facts.length > 0 && (
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {facts.map((f) => (
                  <div key={f.k}>
                    <dt className="text-muted text-[11px] font-medium tracking-wide uppercase">
                      {f.k}
                    </dt>
                    <dd className="text-sm font-semibold">{f.v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {d.record && (d.record.startedAt || d.record.completedAt) && (
              <p className="text-muted mt-3 text-sm">
                {d.record.startedAt &&
                  `${t("record.startedAt")}: ${fmtDate(d.record.startedAt, locale, tz, { dateStyle: "medium", timeStyle: "short" })}`}
                {d.record.startedAt && d.record.completedAt && " · "}
                {d.record.completedAt &&
                  `${t("record.completedAt")}: ${fmtDate(d.record.completedAt, locale, tz, { dateStyle: "medium", timeStyle: "short" })}`}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/library/${r.id}/konspekt`}>
                  <ScrollText /> {t("resource.konspekt")}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/notes/new?resource=${r.id}&kind=quote`}>
                  <Quote /> {t("resource.addQuote")}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/notes/new?resource=${r.id}`}>
                  <StickyNote /> {t("resource.addNote")}
                </Link>
              </Button>
              <CollectionPicker
                collections={cols}
                selected={inCols}
                target={{ resourceId: r.id }}
              />
            </div>
            <div className="mt-3">
              <CatalogActions
                type="resource"
                id={r.id}
                isAdmin={user.role === "superadmin"}
                canEdit={d.canEdit}
                archived={!!r.deletedAt}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {youtube && (
            <div className="border-border overflow-hidden rounded-2xl border bg-black">
              <iframe
                className="aspect-video w-full"
                src={`https://www.youtube-nocookie.com/embed/${youtube}`}
                title={r.title}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}

          {r.description && (
            <Card className="p-5 sm:p-6">
              <h2 className="mb-2 text-sm font-semibold">{t("common.description")}</h2>
              <p className="prose-nn text-foreground/90 text-[15px]">{r.description}</p>
            </Card>
          )}

          <Card>
            <CardHeader
              title={t("resource.konspekt")}
              icon={<ScrollText />}
              hue="violet"
              description={t("resource.konspektChapters", { count: sections.length })}
              action={
                <Link
                  href={`/library/${r.id}/konspekt`}
                  className="text-primary text-xs font-semibold hover:underline"
                >
                  {t("resource.konspektOpen")} →
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {sections.length === 0 ? (
                <p className="text-muted text-sm">{t("resource.konspektEmpty")}</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <Link
                        href={`/library/${r.id}/konspekt?s=${s.id}`}
                        className="hover:bg-surface-2 flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <span className="text-muted w-6 shrink-0 text-right text-xs tabular-nums">
                          {i + 1}.
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                        {s.pageFrom != null && (
                          <span className="text-muted text-xs">p. {s.pageFrom}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("resource.myNotes")}
              icon={<StickyNote />}
              hue="teal"
              description={
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3" /> {t("resource.myLearningHint")}
                </span>
              }
            />
            <ul className="divide-border flex flex-col divide-y px-5 pb-4">
              {d.myNotes.length === 0 && (
                <li className="text-muted pb-2 text-sm">{t("dashboard.noNotes")}</li>
              )}
              {d.myNotes.map((n) => (
                <li key={n.id} className="py-3">
                  <Link href={`/notes/${n.id}`} className="block hover:opacity-80">
                    {n.kind === "quote" ? (
                      <blockquote className="border-l-2 border-[var(--c-violet)] pl-3 font-serif italic">
                        “{n.quoteText}”
                      </blockquote>
                    ) : (
                      <p className="line-clamp-3 text-sm">
                        {n.title && <strong>{n.title} — </strong>}
                        {n.body}
                      </p>
                    )}
                    <span className="text-muted mt-1 block text-xs">
                      {n.pageFrom != null &&
                        (n.pageTo && n.pageTo !== n.pageFrom
                          ? t("notes.pages", { from: n.pageFrom, to: n.pageTo })
                          : t("notes.page", { page: n.pageFrom }))}
                      {n.location ? ` · ${n.location}` : ""} · {fmtDate(n.createdAt, locale, tz)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {d.publicNotes.length > 0 && (
            <Card>
              <CardHeader title={t("resource.publicNotes")} icon={<Quote />} hue="sky" />
              <ul className="flex flex-col gap-3 px-5 pb-5">
                {d.publicNotes.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}`} className="block hover:opacity-80">
                      {n.kind === "quote" ? (
                        <blockquote className="border-border-strong border-l-2 pl-3 font-serif italic">
                          “{n.quoteText}”
                        </blockquote>
                      ) : (
                        <p className="text-sm">{n.title ?? n.body}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(d.categories.length > 0 ||
            d.tags.length > 0 ||
            links.length > 0 ||
            d.identifiers.length > 0) && (
            <Card className="p-5">
              {(d.categories.length > 0 || d.tags.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {d.categories.map((c) => (
                    <Link
                      key={c.id}
                      href={`/library?category=${c.id}`}
                      style={hueStyle(hueFor(c.id))}
                      className="chip rounded-full px-2.5 py-1 text-xs font-medium hover:underline"
                    >
                      {locale === "uz" ? c.nameUz : c.nameEn}
                    </Link>
                  ))}
                  {d.tags.map((tg) => (
                    <Link
                      key={tg.id}
                      href={`/search?q=${encodeURIComponent(tg.name)}`}
                      className="bg-surface-2 text-muted rounded-full px-2.5 py-1 text-xs hover:underline"
                    >
                      #{tg.name}
                    </Link>
                  ))}
                </div>
              )}
              {links.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5">
                  {links.map((l) => (
                    <li key={l.id}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
                      >
                        <ExternalLink className="size-3.5" /> {l.label || t(`linkKinds.${l.kind}`)}{" "}
                        <span className="text-muted text-xs">{new URL(l.url).hostname}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {d.identifiers.length > 0 && (
                <p className="text-muted mt-3 text-xs">
                  {d.identifiers.map((i) => `${i.scheme.toUpperCase()} ${i.value}`).join(" · ")}
                </p>
              )}
            </Card>
          )}

          {d.media?.transcript && (
            <details id="transcript" className="card p-5">
              <summary className="cursor-pointer text-sm font-semibold">
                {t("resource.transcript")}
              </summary>
              <p className="prose-nn mt-3 max-h-[60vh] overflow-y-auto text-sm">
                {d.media.transcript}
              </p>
            </details>
          )}

          {d.related.length > 0 && (
            <Card>
              <CardHeader title={t("resource.related")} icon={<BookOpenText />} hue="indigo" />
              <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
                {d.related.map((x) => (
                  <li key={`${x.id}-${x.kind}`}>
                    <Link
                      href={`/library/${x.id}`}
                      className="border-border hover:bg-surface-2 flex flex-col rounded-lg border px-3 py-2"
                    >
                      <span className="truncate text-sm font-medium">{x.title}</span>
                      <span className="text-muted text-xs">
                        {t(`types.${x.type}`)} · {t(`resource.relationKinds.${x.kind}`)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title={t("record.title")}
              icon={<BookOpenText />}
              hue="blue"
              description={
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3" /> {t("resource.myLearningHint")}
                </span>
              }
            />
            <div className="px-5 pb-5">
              <RecordForm
                key={d.record ? `${d.record.status}-${d.record.updatedAt.getTime()}` : "none"}
                resourceId={r.id}
                isMedia={isMedia}
                defaultTotal={progressTotal}
                defaultUnit={progressUnit}
                record={
                  d.record && {
                    status: d.record.status,
                    startedAt: d.record.startedAt?.toISOString() ?? null,
                    completedAt: d.record.completedAt?.toISOString() ?? null,
                    rating: d.record.rating,
                    review: d.record.review,
                    progressCurrent: d.record.progressCurrent,
                    progressTotal: d.record.progressTotal,
                    progressUnit: d.record.progressUnit,
                  }
                }
              />
            </div>
          </Card>
          {!isMedia && (
            <Card>
              <CardHeader title={t("resource.reading")} icon={<FileText />} hue="violet" />
              <div className="px-5 pb-5">
                <ReadingPanel
                  resourceId={r.id}
                  readingUrl={d.book?.readingUrl ?? null}
                  files={files}
                  sources={sources.map((s) => ({
                    kind: s.kind,
                    status: s.status,
                    pages: s.pages,
                    url: s.url,
                    fileId: s.fileId,
                  }))}
                  storageEnabled={storage}
                  userId={user.id}
                />
              </div>
            </Card>
          )}
        </aside>
      </div>
    </article>
  );
}

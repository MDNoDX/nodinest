import { ExternalLink, Lock, Quote, StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StartSessionButton } from "@/components/journal/start-session-button";
import { Attachments } from "@/components/library/attachments";
import { CatalogActions } from "@/components/library/catalog-actions";
import { CollectionPicker } from "@/components/library/collection-picker";
import { Cover, coverSrc } from "@/components/library/cover";
import { RecordForm } from "@/components/library/record-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { formatPartialDate } from "@/lib/dates";
import { fmtDate, fmtMinutes } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { getResourceDetail } from "@/server/catalog";
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
  const [d, cols, inCols, files] = await Promise.all([
    getResourceDetail(db, ctx, id),
    listCollections(db, ctx),
    collectionsContaining(db, ctx, { resourceId: id }),
    storage ? listAttachments(ctx, id) : Promise.resolve([]),
  ]);
  if (!d) notFound();
  const r = d.resource;
  const youtube = d.identifiers.find((i) => i.scheme === "youtube")?.value;
  const meta: [string, React.ReactNode][] = [];
  if (r.publicationDate)
    meta.push([t("resource.published"), formatPartialDate(r.publicationDate, locale)]);
  if (r.language) meta.push([t("resource.language"), r.language]);
  if (d.book?.publisher) meta.push([t("resource.publisher"), d.book.publisher]);
  if (d.book?.edition) meta.push([t("resource.edition"), d.book.edition]);
  if (d.book?.pageCount) meta.push([t("resource.pageCount"), d.book.pageCount]);
  if (d.book?.originalLanguage)
    meta.push([t("resource.originalLanguage"), d.book.originalLanguage]);
  if (d.book?.fileFormat) meta.push([t("resource.fileFormat"), d.book.fileFormat]);
  if (d.media?.platform) meta.push([t("resource.platform"), d.media.platform]);
  if (d.media?.channel) meta.push([t("resource.channel"), d.media.channel]);
  if (d.media?.durationSeconds)
    meta.push([t("resource.durationValue"), fmtMinutes(d.media.durationSeconds, locale)]);
  if (r.originalTitle) meta.push([t("resource.originalTitle"), r.originalTitle]);
  for (const i of d.identifiers)
    meta.push([
      i.scheme.toUpperCase(),
      <span key={i.id} className="font-mono text-xs">
        {i.value}
      </span>,
    ]);
  meta.push([
    t("resource.verification"),
    <Badge
      key="v"
      tone={
        r.verification === "verified"
          ? "success"
          : r.verification === "disputed"
            ? "danger"
            : "neutral"
      }
    >
      {t(`verification.${r.verification}`)}
    </Badge>,
  ]);

  const externalLinks = [
    ...(r.sourceUrl
      ? [{ id: "src", kind: "source", url: r.sourceUrl, label: null as string | null }]
      : []),
    ...(d.book?.readingUrl
      ? [{ id: "read", kind: "read", url: d.book.readingUrl, label: null }]
      : []),
    ...(d.book?.purchaseUrl
      ? [{ id: "buy", kind: "purchase", url: d.book.purchaseUrl, label: null }]
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

  return (
    <article>
      {r.deletedAt && (
        <div className="bg-warning-soft text-warning mb-4 rounded-lg px-4 py-2 text-sm">
          {t("resource.archivedBanner")}
        </div>
      )}
      <div className="flex flex-col gap-6 md:flex-row">
        <Cover
          type={r.type}
          title={r.title}
          src={coverSrc(r)}
          size="lg"
          className={r.type === "book" || r.type === "course" ? "" : "md:w-80"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{t(`types.${r.type}`)}</Badge>
            {d.record && <Badge tone="accent">{t(`status.${d.record.status}`)}</Badge>}
          </div>
          <h1 className="mt-2 font-serif text-3xl leading-tight font-semibold tracking-tight">
            {r.title}
          </h1>
          {d.contributors.length > 0 && (
            <p className="text-muted mt-2 text-sm">
              {d.contributors.map((c, i) => (
                <span key={`${c.id}-${c.role}`}>
                  {i > 0 && ", "}
                  <Link
                    href={`/people/${c.id}`}
                    className="text-foreground font-medium hover:underline"
                  >
                    {c.fullName}
                  </Link>{" "}
                  <span className="text-xs">({t(`contributorRoles.${c.role}`)})</span>
                </span>
              ))}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <StartSessionButton resourceId={r.id} label={t("resource.startSession")} />
            <Button variant="outline" asChild>
              <Link href={`/journal?log=${r.id}`}>{t("resource.logSession")}</Link>
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
            <CollectionPicker collections={cols} selected={inCols} target={{ resourceId: r.id }} />
          </div>
          <div className="mt-4">
            <CatalogActions
              type="resource"
              id={r.id}
              isAdmin={user.role === "superadmin"}
              archived={!!r.deletedAt}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {youtube && (
            <div className="border-border overflow-hidden rounded-xl border bg-black">
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
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold">{t("common.description")}</h2>
              <p className="prose-nn text-foreground/90 text-[15px]">{r.description}</p>
            </Card>
          )}
          <Card>
            <CardHeader title={t("resource.metadata")} />
            <dl className="grid gap-x-6 gap-y-3 px-5 pb-5 text-sm sm:grid-cols-2">
              {meta.map(([k, val], i) => (
                <div key={i} className="flex flex-col">
                  <dt className="text-muted text-xs">{k}</dt>
                  <dd className="mt-0.5">{val}</dd>
                </div>
              ))}
            </dl>
            {(d.categories.length > 0 || d.tags.length > 0) && (
              <div className="border-border flex flex-wrap gap-1.5 border-t px-5 py-4">
                {d.categories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/library?category=${c.id}`}
                    className="bg-primary-soft text-primary rounded-full px-2.5 py-0.5 text-xs font-medium hover:underline"
                  >
                    {locale === "uz" ? c.nameUz : c.nameEn}
                  </Link>
                ))}
                {d.tags.map((tg) => (
                  <Link
                    key={tg.id}
                    href={`/search?q=${encodeURIComponent(tg.name)}`}
                    className="bg-surface-2 text-muted rounded-full px-2.5 py-0.5 text-xs hover:underline"
                  >
                    #{tg.name}
                  </Link>
                ))}
              </div>
            )}
            {r.sourceNote && (
              <p className="border-border text-muted border-t px-5 py-3 text-xs">
                {t("common.source")}: {r.sourceNote}
              </p>
            )}
          </Card>

          {externalLinks.length > 0 && (
            <Card>
              <CardHeader title={t("common.links")} />
              <ul className="flex flex-col gap-1.5 px-5 pb-5">
                {externalLinks.map((l) => (
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
            </Card>
          )}

          {d.book?.tableOfContents && (
            <details className="card p-5">
              <summary className="cursor-pointer text-sm font-semibold">
                {t("resource.toc")}
              </summary>
              <p className="prose-nn mt-3 text-sm">{d.book.tableOfContents}</p>
            </details>
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

          <Card>
            <CardHeader
              title={t("resource.myNotes")}
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
                      <blockquote className="border-accent border-l-2 pl-3 font-serif italic">
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
              <CardHeader title={t("resource.publicNotes")} />
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

          {d.related.length > 0 && (
            <Card>
              <CardHeader title={t("resource.related")} />
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
              title={t("resource.myLearning")}
              description={
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3" /> {t("resource.myLearningHint")}
                </span>
              }
            />
            <div className="grid grid-cols-2 gap-3 px-5 pb-4">
              <div>
                <div className="text-muted text-xs">{t("resource.totalTime")}</div>
                <div className="font-serif text-xl font-semibold">
                  {fmtMinutes(d.myTotals.seconds, locale)}
                </div>
              </div>
              <div>
                <div className="text-muted text-xs">{t("stats.sessions")}</div>
                <div className="font-serif text-xl font-semibold">
                  {t("resource.sessionsCount", { count: d.myTotals.sessions })}
                </div>
              </div>
            </div>
            <div className="border-border border-t px-5 py-4">
              {!d.record && <p className="text-muted mb-3 text-sm">{t("resource.noRecord")}</p>}
              <RecordForm
                key={d.record ? `${d.record.status}-${d.record.updatedAt.getTime()}` : "none"}
                resourceId={r.id}
                defaultTotal={progressTotal}
                defaultUnit={progressUnit}
                record={
                  d.record && {
                    status: d.record.status,
                    startedOn: d.record.startedOn,
                    completedOn: d.record.completedOn,
                    rating: d.record.rating,
                    review: d.record.review,
                    learningGoals: d.record.learningGoals,
                    personalNotes: d.record.personalNotes,
                    progressCurrent: d.record.progressCurrent,
                    progressTotal: d.record.progressTotal,
                    progressUnit: d.record.progressUnit,
                  }
                }
              />
            </div>
          </Card>
          <Card>
            <CardHeader
              title={t("resource.attachments")}
              description={t("resource.attachmentsHint")}
            />
            <div className="px-5 pb-5">
              <Attachments resourceId={r.id} files={files} enabled={storage} />
            </div>
          </Card>
        </aside>
      </div>
    </article>
  );
}

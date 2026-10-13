import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CatalogActions } from "@/components/library/catalog-actions";
import { Cover, coverSrc } from "@/components/library/cover";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { formatPartialDate } from "@/lib/dates";
import { pageContext } from "@/lib/page";
import { getPersonDetail } from "@/server/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const { ctx, db } = await pageContext();
  return { title: (await getPersonDetail(db, ctx, id))?.person.fullName };
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user, locale } = await pageContext();
  const t = await getTranslations();
  const d = await getPersonDetail(db, ctx, id);
  if (!d) notFound();
  const p = d.person;
  const img = p.portraitFileId ? `/api/files/${p.portraitFileId}` : p.portraitUrl;
  const lived =
    p.birthDate && p.deathDate
      ? t("person.lived", {
          birth: formatPartialDate(p.birthDate, locale),
          death: formatPartialDate(p.deathDate, locale),
        })
      : p.birthDate
        ? t("person.born", { date: formatPartialDate(p.birthDate, locale) })
        : p.deathDate
          ? t("person.lived", { birth: "?", death: formatPartialDate(p.deathDate, locale) })
          : null;
  const links = [
    ...(p.websiteUrl
      ? [{ id: "web", kind: "official", url: p.websiteUrl, label: t("person.website") }]
      : []),
    ...d.links,
  ];

  return (
    <article>
      {p.deletedAt && (
        <div className="bg-warning-soft text-warning mb-4 rounded-lg px-4 py-2 text-sm">
          {t("common.archived")}
        </div>
      )}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={p.fullName} image={img} className="size-28 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">{p.fullName}</h1>
          {p.shortDescription && <p className="text-muted mt-1">{p.shortDescription}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.roles.map((r) => (
              <Badge key={r} tone="primary">
                {t(`personRoles.${r}`)}
              </Badge>
            ))}
            <Badge
              tone={
                p.verification === "verified"
                  ? "success"
                  : p.verification === "disputed"
                    ? "danger"
                    : "neutral"
              }
            >
              {t(`verification.${p.verification}`)}
            </Badge>
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {lived && (
              <div>
                <dt className="text-muted text-xs">
                  {p.deathDate ? t("person.lifespan") : t("person.birthDate")}
                </dt>
                <dd>{lived}</dd>
              </div>
            )}
            {p.nationality && (
              <div>
                <dt className="text-muted text-xs">{t("person.nationality")}</dt>
                <dd>{p.nationality}</dd>
              </div>
            )}
            {p.activityAreas && (
              <div>
                <dt className="text-muted text-xs">{t("person.activityAreas")}</dt>
                <dd>{p.activityAreas}</dd>
              </div>
            )}
            {d.aliases.length > 0 && (
              <div className="sm:col-span-3">
                <dt className="text-muted text-xs">{t("person.aliases")}</dt>
                <dd>{d.aliases.map((a) => a.alias).join(" · ")}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4">
            <CatalogActions
              type="person"
              id={p.id}
              isAdmin={user.role === "superadmin"}
              canEdit={d.canEdit}
              archived={!!p.deletedAt}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {p.biography && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold">{t("person.biography")}</h2>
              <p className="prose-nn text-[15px]">{p.biography}</p>
            </Card>
          )}
          <Card>
            <CardHeader
              title={t("person.works")}
              action={
                d.works.length > 0 ? (
                  <Link
                    href={`/library?person=${p.id}`}
                    className="text-primary text-xs font-medium hover:underline"
                  >
                    {t("common.seeAll")}
                  </Link>
                ) : undefined
              }
            />
            {d.works.length === 0 ? (
              <p className="text-muted px-5 pb-5 text-sm">{t("person.noWorks")}</p>
            ) : (
              <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
                {d.works.map((w) => (
                  <li key={`${w.id}-${w.role}`}>
                    <Link
                      href={`/library/${w.id}`}
                      className="border-border hover:bg-surface-2 flex gap-3 rounded-lg border p-2.5"
                    >
                      <Cover type={w.type} title={w.title} src={coverSrc(w)} size="sm" />
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-medium">{w.title}</div>
                        <div className="text-muted text-xs">
                          {t(`types.${w.type}`)} · {t(`contributorRoles.${w.role}`)}
                          {w.publicationDate ? ` · ${w.publicationDate.slice(0, 4)}` : ""}
                        </div>
                        {w.myStatus && (
                          <Badge tone="accent" className="mt-1">
                            {t(`status.${w.myStatus}`)}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <aside className="flex flex-col gap-6">
          {links.length > 0 && (
            <Card>
              <CardHeader title={t("common.sources")} />
              <ul className="flex flex-col gap-1.5 px-5 pb-5">
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
            </Card>
          )}
          <Card>
            <CardHeader title={t("person.myQuotes")} />
            <ul className="flex flex-col gap-3 px-5 pb-5">
              {d.quotes.length === 0 && (
                <li className="text-muted text-sm">{t("dashboard.noNotes")}</li>
              )}
              {d.quotes.map((q) => (
                <li key={q.id}>
                  <Link
                    href={`/notes/${q.id}`}
                    className="border-accent block border-l-2 pl-3 font-serif text-sm italic hover:opacity-80"
                  >
                    “{q.quoteText}”
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </article>
  );
}

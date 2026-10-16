import { Search } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverTile } from "@/components/library/cover-tile";
import { SearchControls } from "@/components/search/search-controls";
import { Badge, EmptyState, PageHeader, Pagination, TypeBadge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { shortYear } from "@/lib/dates";
import type { SnippetPart } from "@/lib/normalize";
import { pageContext, sp, spInt, type SP } from "@/lib/page";
import { LEARNING_STATUSES, RESOURCE_TYPES, type ResourceType } from "@/lib/validation";
import { listCategories } from "@/server/catalog";
import {
  SEARCH_GROUPS,
  universalSearch,
  type GroupResult,
  type SearchGroup,
} from "@/server/search";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("search"))("title") };
}

function Snippet({ parts }: { parts: SnippetPart[] }) {
  if (!parts.length) return null;
  return (
    <p className="text-muted mt-1 line-clamp-3 text-sm">
      {parts.map((p, i) =>
        p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </p>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const q = (sp(p.q) ?? "").slice(0, 200);
  const g = sp(p.group);
  const group = (SEARCH_GROUPS as readonly string[]).includes(g ?? "") ? (g as SearchGroup) : null;
  const statusParam = sp(p.status);
  const genres = [...new Set(all(p.g).filter((x) => UUID.test(x)))].slice(0, 10);
  const filters = {
    q,
    group,
    resourceType: (RESOURCE_TYPES as readonly string[]).includes(sp(p.type) ?? "")
      ? sp(p.type)!
      : null,
    status:
      statusParam === "none" || (LEARNING_STATUSES as readonly string[]).includes(statusParam ?? "")
        ? statusParam!
        : null,
    categoryIds: genres,
    visibility: sp(p.visibility) === "public" ? ("public" as const) : ("mine" as const),
    from: sp(p.from) ?? null,
    to: sp(p.to) ?? null,
    sort: (["relevance", "title", "date", "updated"].includes(sp(p.sort) ?? "")
      ? sp(p.sort)
      : "relevance") as "relevance",
    resourceId: UUID.test(sp(p.resource) ?? "") ? sp(p.resource)! : null,
    page: spInt(p.page),
  };
  const browsing = !q.trim() && !!(genres.length || filters.resourceType || filters.status);
  const [res, cats] = await Promise.all([
    q.trim() || browsing ? universalSearch(db, ctx, filters) : Promise.resolve(null),
    listCategories(db, ctx),
  ]);
  const params = (o: Record<string, string | string[] | null>) => {
    const u = new URLSearchParams();
    const base: Record<string, string | string[] | null> = {
      q: q || null,
      group,
      type: filters.resourceType,
      status: filters.status,
      g: genres,
      visibility: filters.visibility === "public" ? "public" : null,
      from: filters.from,
      to: filters.to,
      sort: filters.sort === "relevance" ? null : filters.sort,
      resource: filters.resourceId,
    };
    for (const [k, v] of Object.entries({ ...base, ...o }))
      for (const x of Array.isArray(v) ? v : v ? [v] : []) u.append(k, x);
    return `/search?${u}`;
  };
  const groups = res ? (Object.entries(res.groups) as [SearchGroup, GroupResult][]) : [];
  const totalAll = groups.reduce((a, [, r]) => a + r.total, 0);
  const activeGroup = browsing ? "resources" : group;

  return (
    <>
      <PageHeader section="search" title={t("search.title")} />
      <SearchControls
        categories={cats.map((c) => ({ id: c.id, name: locale === "uz" ? c.nameUz : c.nameEn }))}
      />
      {filters.resourceId && (
        <p className="text-muted -mt-2 mb-4 flex items-center gap-2 text-sm">
          <Badge tone="primary">{t("search.inOneBook")}</Badge>
          <Link href={params({ resource: null, page: null })} className="hover:underline">
            {t("common.reset")}
          </Link>
        </p>
      )}

      {q.trim() && (
        <nav className="mb-6 flex flex-wrap gap-1.5" aria-label={t("common.filters")}>
          <Link
            href={params({ group: null, page: null })}
            aria-current={!group ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              !group
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted hover:text-foreground",
            )}
          >
            {t("search.all")}
          </Link>
          {SEARCH_GROUPS.filter((sg) => group === sg || (res?.groups[sg]?.total ?? 0) > 0).map(
            (sg) => (
              <Link
                key={sg}
                href={params({ group: sg, page: null })}
                aria-current={group === sg ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-sm",
                  group === sg
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-muted hover:text-foreground",
                )}
              >
                {t(`search.groups.${sg}`)}
                {!group && res?.groups[sg] ? (
                  <span className="ml-1 opacity-70">{res.groups[sg]!.total}</span>
                ) : null}
              </Link>
            ),
          )}
        </nav>
      )}

      {!res ? (
        <EmptyState icon={<Search />} title={t("search.startTyping")} />
      ) : totalAll === 0 ? (
        <EmptyState
          icon={<Search />}
          title={q ? t("search.noResults", { q }) : t("search.noBrowseResults")}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups
            .filter(([, r]) => r.total > 0)
            .map(([key, r]) => (
              <section key={key} aria-labelledby={`g-${key}`}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 id={`g-${key}`} className="text-sm font-semibold">
                    {t(`search.groups.${key}`)}{" "}
                    <span className="text-muted font-normal">({r.total})</span>
                  </h2>
                  {!activeGroup && r.total > r.hits.length && (
                    <Link
                      href={params({ group: key })}
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      {t("search.showAll", { count: r.total })}
                    </Link>
                  )}
                </div>
                {key === "resources" ? (
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {r.hits.map((h) => (
                      <li key={h.id}>
                        <CoverTile
                          id={h.id}
                          type={h.kind as ResourceType}
                          title={h.title}
                          cover={h.cover ?? null}
                          line={h.subtitle}
                          status={h.status ?? null}
                          progress={h.progress}
                          rating={h.rating}
                          meta={
                            <>
                              <TypeBadge
                                type={h.kind as ResourceType}
                                label={t(`types.${h.kind}`)}
                              />
                              {h.date && <span>{shortYear(h.date)}</span>}
                            </>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="card divide-border divide-y">
                    {r.hits.map((h) => (
                      <li key={`${h.group}-${h.id}`}>
                        <Link
                          href={h.href}
                          {...(/^(https?:|\/api\/)/.test(h.href)
                            ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                            : {})}
                          className="hover:bg-surface-2/60 focus-visible:bg-surface-2 block px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "font-medium",
                                key === "quotes" && "text-muted text-sm",
                              )}
                            >
                              {h.title}
                            </span>
                            {h.kind && key !== "notes" && key !== "quotes" && (
                              <Badge>
                                {t.has(`types.${h.kind}`) ? t(`types.${h.kind}`) : h.kind}
                              </Badge>
                            )}
                          </div>
                          {h.subtitle && <div className="text-muted text-xs">{h.subtitle}</div>}
                          {key === "quotes" ? (
                            <p className="mt-1 font-serif italic">
                              “
                              {h.snippet.map((p, i) =>
                                p.match ? (
                                  <mark key={i}>{p.text}</mark>
                                ) : (
                                  <span key={i}>{p.text}</span>
                                ),
                              )}
                              ”
                            </p>
                          ) : (
                            <Snippet parts={h.snippet} />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          {activeGroup && res && (
            <Pagination
              page={res.page}
              total={res.groups[activeGroup]?.total ?? 0}
              pageSize={res.pageSize}
              hrefFor={(n) => params({ page: String(n) })}
              labels={{
                previous: t("common.previous"),
                next: t("common.next"),
                page: t("common.page", {
                  page: res.page,
                  total: Math.max(
                    1,
                    Math.ceil((res.groups[activeGroup]?.total ?? 0) / res.pageSize),
                  ),
                }),
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

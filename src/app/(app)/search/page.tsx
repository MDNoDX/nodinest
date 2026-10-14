import { Check, Search } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverTile } from "@/components/library/cover-tile";
import { AutoSubmitForm } from "@/components/ui/auto-submit";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, EmptyState, PageHeader, Pagination, TypeBadge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { shortYear } from "@/lib/dates";
import { hueFor, hueStyle } from "@/lib/hues";
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
      <PageHeader section="search" title={t("search.title")} subtitle={t("search.hint")} />
      <AutoSubmitForm className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("search.placeholder")}
            aria-label={t("common.search")}
            className="h-12 pl-11 text-base"
            autoFocus={!q && !browsing}
          />
        </div>
        {group && <input type="hidden" name="group" value={group} />}
        {filters.resourceId && (
          <>
            <input type="hidden" name="resource" value={filters.resourceId} />
            <p className="text-muted flex items-center gap-2 text-sm">
              <Badge tone="primary">{t("search.inOneBook")}</Badge>
              <Link href={params({ resource: null, page: null })} className="hover:underline">
                {t("common.reset")}
              </Link>
            </p>
          </>
        )}

        {cats.length > 0 && (
          <fieldset>
            <legend className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
              {t("search.genres")}
              {genres.length > 1 && (
                <span className="ml-2 font-normal normal-case">{t("search.genresAll")}</span>
              )}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => {
                const on = genres.includes(c.id);
                return (
                  <label
                    key={c.id}
                    style={hueStyle(hueFor(c.id))}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors select-none focus-within:ring-2 focus-within:ring-[var(--hue)]/40",
                      on
                        ? "chip hue-border"
                        : "border-border-strong text-muted hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="g"
                      value={c.id}
                      defaultChecked={on}
                      className="sr-only"
                    />
                    {on && <Check className="size-3.5" />}
                    {locale === "uz" ? c.nameUz : c.nameEn}
                    {c.count ? <span className="tabular-nums opacity-60">{c.count}</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Select
            name="type"
            defaultValue={filters.resourceType ?? ""}
            aria-label={t("common.type")}
          >
            <option value="">{t("library.allTypes")}</option>
            {RESOURCE_TYPES.map((r) => (
              <option key={r} value={r}>
                {t(`types.${r}`)}
              </option>
            ))}
          </Select>
          <Select
            name="status"
            defaultValue={filters.status ?? ""}
            aria-label={t("library.myStatus")}
          >
            <option value="">{t("library.anyStatus")}</option>
            {LEARNING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
            <option value="none">{t("status.notInLibrary")}</option>
          </Select>
          <Select
            name="visibility"
            defaultValue={filters.visibility}
            aria-label={t("common.visibility")}
          >
            <option value="mine">{t("search.mine")}</option>
            <option value="public">{t("search.publicNotes")}</option>
          </Select>
          <Input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            aria-label={t("common.from")}
          />
          <Input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            aria-label={t("common.to")}
          />
          <Select name="sort" defaultValue={filters.sort} aria-label={t("common.sort")}>
            <option value="relevance">{t("search.relevance")}</option>
            <option value="title">{t("search.sortTitle")}</option>
            <option value="date">{t("search.sortDate")}</option>
            <option value="updated">{t("search.sortUpdated")}</option>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">{t("common.search")}</Button>
          {(q || genres.length || filters.resourceType || filters.status) && (
            <Link href="/search" className="text-muted hover:text-foreground text-sm">
              {t("common.reset")}
            </Link>
          )}
        </div>
      </AutoSubmitForm>

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
          {SEARCH_GROUPS.map((sg) => (
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
          ))}
        </nav>
      )}

      {!res ? (
        <EmptyState
          icon={<Search />}
          title={t("search.startTyping")}
          body={t("search.browseHint")}
        />
      ) : totalAll === 0 ? (
        <EmptyState
          icon={<Search />}
          title={q ? t("search.noResults", { q }) : t("search.noBrowseResults")}
          body={t("search.noResultsHint")}
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

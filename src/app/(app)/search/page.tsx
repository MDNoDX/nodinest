import { Search } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AutoSubmitForm } from "@/components/ui/auto-submit";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { SnippetPart } from "@/lib/normalize";
import { pageContext, sp, spInt, type SP } from "@/lib/page";
import { LEARNING_STATUSES, RESOURCE_TYPES } from "@/lib/validation";
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

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const q = (sp(p.q) ?? "").slice(0, 200);
  const g = sp(p.group);
  const group = (SEARCH_GROUPS as readonly string[]).includes(g ?? "") ? (g as SearchGroup) : null;
  const filters = {
    q,
    group,
    resourceType: (RESOURCE_TYPES as readonly string[]).includes(sp(p.type) ?? "")
      ? sp(p.type)!
      : null,
    status: (LEARNING_STATUSES as readonly string[]).includes(sp(p.status) ?? "")
      ? sp(p.status)!
      : null,
    visibility: sp(p.visibility) === "public" ? ("public" as const) : ("mine" as const),
    from: sp(p.from) ?? null,
    to: sp(p.to) ?? null,
    sort: (["relevance", "title", "date", "updated"].includes(sp(p.sort) ?? "")
      ? sp(p.sort)
      : "relevance") as "relevance",
    page: spInt(p.page),
  };
  const res = q.trim() ? await universalSearch(db, ctx, filters) : null;
  const params = (o: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const base: Record<string, string | null> = {
      q,
      group,
      type: filters.resourceType,
      status: filters.status,
      visibility: filters.visibility === "public" ? "public" : null,
      from: filters.from,
      to: filters.to,
      sort: filters.sort === "relevance" ? null : filters.sort,
    };
    for (const [k, v] of Object.entries({ ...base, ...o })) if (v) u.set(k, v);
    return `/search?${u}`;
  };
  const groups = res ? (Object.entries(res.groups) as [SearchGroup, GroupResult][]) : [];
  const totalAll = groups.reduce((a, [, r]) => a + r.total, 0);

  return (
    <>
      <PageHeader title={t("search.title")} subtitle={t("search.hint")} />
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
            autoFocus={!q}
          />
        </div>
        {group && <input type="hidden" name="group" value={group} />}
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
        <Button type="submit" className="self-start">
          {t("common.search")}
        </Button>
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

      {!q.trim() ? (
        <EmptyState icon={<Search />} title={t("search.startTyping")} />
      ) : totalAll === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t("search.noResults", { q })}
          body={t("search.noResultsHint")}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups
            .filter(([, r]) => r.total > 0)
            .map(([key, r]) => (
              <section key={key} aria-labelledby={`g-${key}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 id={`g-${key}`} className="text-sm font-semibold">
                    {t(`search.groups.${key}`)}{" "}
                    <span className="text-muted font-normal">({r.total})</span>
                  </h2>
                  {!group && r.total > r.hits.length && (
                    <Link
                      href={params({ group: key })}
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      {t("search.showAll", { count: r.total })}
                    </Link>
                  )}
                </div>
                <ul className="card divide-border divide-y">
                  {r.hits.map((h) => (
                    <li key={`${h.group}-${h.id}`}>
                      <Link
                        href={h.href}
                        className="hover:bg-surface-2/60 focus-visible:bg-surface-2 block px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn("font-medium", key === "quotes" && "text-muted text-sm")}
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
              </section>
            ))}
          {group && res && (
            <Pagination
              page={res.page}
              total={res.groups[group]?.total ?? 0}
              pageSize={res.pageSize}
              hrefFor={(n) => params({ page: String(n) })}
              labels={{
                previous: t("common.previous"),
                next: t("common.next"),
                page: t("common.page", {
                  page: res.page,
                  total: Math.max(1, Math.ceil((res.groups[group]?.total ?? 0) / res.pageSize)),
                }),
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

import { BookOpen, Copy, Plus, Search } from "lucide-react";
import { DarsxonaTabs } from "@/components/library/darsxona-tabs";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { coverSrc } from "@/components/library/cover";
import { CoverTile } from "@/components/library/cover-tile";
import { AutoSubmitForm } from "@/components/ui/auto-submit";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Pagination, TypeBadge } from "@/components/ui/misc";
import { LEARNING_STATUSES, RESOURCE_TYPES, type ResourceType } from "@/lib/validation";
import { shortYear } from "@/lib/dates";
import { pageContext, sp, spInt, type SP } from "@/lib/page";
import {
  LIBRARY_SORTS,
  listCategories,
  listReadYears,
  listResources,
  type LibrarySort,
} from "@/server/catalog";
import { findLibraryDuplicates } from "@/server/merge";
import { pickName } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getTranslations("library"))("title") };
}

export default async function LibraryPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale, user, tz } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const typeParam = sp(p.type);
  const filters = {
    q: sp(p.q) ?? "",
    type: (RESOURCE_TYPES as readonly string[]).includes(typeParam ?? "")
      ? (typeParam as ResourceType)
      : null,
    status: sp(p.status) ?? null,
    categoryId: sp(p.category) ?? null,
    personId: sp(p.person) ?? null,
    sort: ((LIBRARY_SORTS as readonly string[]).includes(sp(p.sort) ?? "")
      ? sp(p.sort)
      : "updated") as LibrarySort,
    readYear: spInt(p.ryear, 0) || null,
    timeZone: tz,
    archived: sp(p.archived) === "1",
    // Personal catalogs: the Darsxona is what the user added (admin mode: everything).
    scope: (user.role === "superadmin" && sp(p.scope) === "all" ? "all" : "mine") as "mine" | "all",
    page: spInt(p.page),
  };
  const uuidRe = /^[0-9a-f-]{36}$/i;
  if (filters.categoryId && !uuidRe.test(filters.categoryId)) filters.categoryId = null;
  if (filters.personId && !uuidRe.test(filters.personId)) filters.personId = null;
  if (
    filters.status &&
    filters.status !== "none" &&
    !(LEARNING_STATUSES as readonly string[]).includes(filters.status)
  )
    filters.status = null;

  const [data, cats, dups, readYears] = await Promise.all([
    listResources(db, ctx, filters),
    listCategories(db, ctx),
    findLibraryDuplicates(ctx),
    listReadYears(db, ctx, tz),
  ]);
  // Year headings when sorted by the year read or written.
  const groupKey = (r: (typeof data.items)[number]) =>
    filters.sort === "read"
      ? (r.readYear?.toString() ?? t("library.notFinished"))
      : filters.sort === "year"
        ? r.writtenYear == null
          ? t("library.unknownYear")
          : r.writtenYear < 0
            ? locale === "uz"
              ? `mil. avv. ${-r.writtenYear}`
              : locale === "ru"
                ? `${-r.writtenYear} до н. э.`
                : `${-r.writtenYear} BC`
            : String(r.writtenYear)
        : "";
  const groups: { key: string; items: typeof data.items }[] = [];
  for (const r of data.items) {
    const k = groupKey(r);
    if (groups.at(-1)?.key === k) groups.at(-1)!.items.push(r);
    else groups.push({ key: k, items: [r] });
  }
  const qs = (page: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({
      q: filters.q,
      type: filters.type,
      status: filters.status,
      category: filters.categoryId,
      person: filters.personId,
      sort: filters.sort,
      ryear: filters.readYear,
      archived: filters.archived ? "1" : null,
      scope: filters.scope === "all" ? "all" : null,
    }))
      if (v) u.set(k, String(v));
    u.set("page", String(page));
    return `/library?${u}`;
  };
  const hasFilters = !!(
    filters.q ||
    filters.type ||
    filters.status ||
    filters.categoryId ||
    filters.personId ||
    filters.readYear ||
    filters.archived
  );

  return (
    <>
      <PageHeader
        section="library"
        title={t("library.title")}
        actions={
          <Button asChild>
            <Link href="/library/new">
              <Plus /> {t("library.add")}
            </Link>
          </Button>
        }
      />
      <DarsxonaTabs current="library" />
      {dups.length > 0 && (
        <div className="mb-4 flex">
          <Link
            href="/library/duplicates"
            className="bg-warning-soft text-warning ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:underline"
          >
            <Copy className="size-4" /> {t("library.duplicatesFound", { count: dups.length })}
          </Link>
        </div>
      )}
      <AutoSubmitForm className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]">
        <div className="relative">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder={t("library.searchPlaceholder")}
            aria-label={t("common.search")}
            className="pl-9"
          />
        </div>
        <Select name="type" defaultValue={filters.type ?? ""} aria-label={t("common.type")}>
          <option value="">{t("library.allTypes")}</option>
          {RESOURCE_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`types.plural.${ty}`)}
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
          <option value="none">{t("status.none")}</option>
        </Select>
        <Select
          name="category"
          defaultValue={filters.categoryId ?? ""}
          aria-label={t("library.category")}
        >
          <option value="">{t("library.anyCategory")}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {pickName(locale, { uz: c.nameUz, ru: c.nameRu, en: c.nameEn })}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={filters.sort} aria-label={t("common.sort")}>
          <option value="updated">{t("library.sortUpdated")}</option>
          <option value="added">{t("library.sortAdded")}</option>
          <option value="title">{t("library.sortTitle")}</option>
          <option value="read">{t("library.sortRead")}</option>
          <option value="year">{t("library.sortYear")}</option>
          <option value="date">{t("library.sortDate")}</option>
        </Select>
        <Select
          name="ryear"
          defaultValue={filters.readYear?.toString() ?? ""}
          aria-label={t("library.readYear")}
        >
          <option value="">{t("library.anyReadYear")}</option>
          {readYears.map((y) => (
            <option key={y} value={y}>
              {t("library.readIn", { year: y })}
            </option>
          ))}
        </Select>
        {filters.personId && <input type="hidden" name="person" value={filters.personId} />}
        {filters.scope === "all" && <input type="hidden" name="scope" value="all" />}
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-6">
          {user.role === "superadmin" && (
            <label className="text-muted flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="archived"
                value="1"
                defaultChecked={filters.archived}
                className="size-4 accent-[var(--primary)]"
              />
              {t("library.showArchived")}
            </label>
          )}
          <Button type="submit" variant="secondary" size="sm">
            {t("common.apply")}
          </Button>
          {hasFilters && (
            <Link href="/library" className="text-muted hover:text-foreground text-sm">
              {t("common.reset")}
            </Link>
          )}
          <span className="text-muted ml-auto text-sm">
            {t("common.results", { count: data.total })}
          </span>
        </div>
      </AutoSubmitForm>

      {data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={<Search />} title={t("library.noMatches")} />
        ) : (
          <EmptyState
            icon={<BookOpen />}
            title={t("library.emptyTitle")}
            body={t("library.emptyBody")}
            action={
              <Button asChild>
                <Link href="/library/new">
                  <Plus /> {t("library.add")}
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.key || "all"}>
              {g.key && (
                <h2 className="border-border mb-3 flex items-baseline gap-2 border-b pb-1.5 text-lg font-semibold tabular-nums">
                  {g.key}
                  <span className="text-muted text-sm font-normal">{g.items.length}</span>
                </h2>
              )}
              <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {g.items.map((r) => (
                  <li key={r.id}>
                    <CoverTile
                      id={r.id}
                      type={r.type}
                      title={r.title}
                      cover={coverSrc(r)}
                      line={r.contributors}
                      status={r.myStatus}
                      rating={r.myRating}
                      meta={
                        <>
                          <TypeBadge type={r.type} label={t(`types.${r.type}`)} />
                          {r.publicationDate && <span>{shortYear(r.publicationDate)}</span>}
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <Pagination
        page={data.page}
        total={data.total}
        pageSize={data.pageSize}
        hrefFor={qs}
        labels={{
          previous: t("common.previous"),
          next: t("common.next"),
          page: t("common.page", {
            page: data.page,
            total: Math.max(1, Math.ceil(data.total / data.pageSize)),
          }),
        }}
      />
    </>
  );
}

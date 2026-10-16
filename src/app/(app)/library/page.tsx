import { BookOpen, Copy, Plus, Search } from "lucide-react";
import { cn } from "@/lib/cn";
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
import { listCategories, listResources } from "@/server/catalog";
import { findLibraryDuplicates } from "@/server/merge";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getTranslations("library"))("title") };
}

export default async function LibraryPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale, user } = await pageContext();
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
    sort: (["updated", "title", "date", "added"].includes(sp(p.sort) ?? "")
      ? sp(p.sort)
      : "updated") as "updated",
    archived: sp(p.archived) === "1",
    scope: (sp(p.scope) === "all" ? "all" : "mine") as "mine" | "all",
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

  const [data, cats, dups] = await Promise.all([
    listResources(db, ctx, filters),
    listCategories(db, ctx),
    findLibraryDuplicates(ctx),
  ]);
  const qs = (page: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({
      q: filters.q,
      type: filters.type,
      status: filters.status,
      category: filters.categoryId,
      person: filters.personId,
      sort: filters.sort,
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
      <nav className="mb-4 flex flex-wrap items-center gap-2" aria-label={t("library.scope")}>
        {(["mine", "all"] as const).map((sc) => (
          <Link
            key={sc}
            href={sc === "all" ? "/library?scope=all" : "/library"}
            aria-current={filters.scope === sc ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filters.scope === sc
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {sc === "mine" ? t("library.scopeMine") : t("library.scopeAll")}
          </Link>
        ))}
        {dups.length > 0 && (
          <Link
            href="/library/duplicates"
            className="bg-warning-soft text-warning ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:underline"
          >
            <Copy className="size-4" /> {t("library.duplicatesFound", { count: dups.length })}
          </Link>
        )}
      </nav>
      <AutoSubmitForm className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
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
              {locale === "uz" ? c.nameUz : c.nameEn}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={filters.sort} aria-label={t("common.sort")}>
          <option value="updated">{t("library.sortUpdated")}</option>
          <option value="added">{t("library.sortAdded")}</option>
          <option value="title">{t("library.sortTitle")}</option>
          <option value="date">{t("library.sortDate")}</option>
        </Select>
        {filters.personId && <input type="hidden" name="person" value={filters.personId} />}
        {filters.scope === "all" && <input type="hidden" name="scope" value="all" />}
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
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
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {data.items.map((r) => (
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

import { Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AutoSubmitForm } from "@/components/ui/auto-submit";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { PERSON_ROLES } from "@/lib/validation";
import { pageContext, sp, spInt, type SP } from "@/lib/page";
import { listPeople } from "@/server/catalog";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("people"))("title") };
}

export default async function PeoplePage({ searchParams }: { searchParams: SP }) {
  const { ctx, db } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const role = (PERSON_ROLES as readonly string[]).includes(sp(p.role) ?? "") ? sp(p.role)! : null;
  const f = {
    q: sp(p.q) ?? "",
    role,
    sort: sp(p.sort) === "updated" ? ("updated" as const) : ("name" as const),
    page: spInt(p.page),
  };
  const data = await listPeople(db, ctx, f);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <>
      <PageHeader
        section="people"
        title={t("people.title")}
        subtitle={t("people.subtitle")}
        actions={
          <Button asChild>
            <Link href="/people/new">
              <Plus /> {t("people.add")}
            </Link>
          </Button>
        }
      />
      <AutoSubmitForm className="mb-6 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={f.q}
            placeholder={t("people.searchPlaceholder")}
            aria-label={t("common.search")}
            className="pl-9"
          />
        </div>
        <Select name="role" defaultValue={f.role ?? ""} aria-label={t("person.roles")}>
          <option value="">{t("people.anyRole")}</option>
          {PERSON_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`personRoles.${r}`)}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={f.sort} aria-label={t("common.sort")}>
          <option value="name">{t("people.sortName")}</option>
          <option value="updated">{t("people.sortUpdated")}</option>
        </Select>
        <Button type="submit" variant="secondary">
          {t("common.apply")}
        </Button>
      </AutoSubmitForm>
      {data.items.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={f.q || f.role ? t("library.noMatches") : t("people.emptyTitle")}
          body={f.q || f.role ? undefined : t("people.emptyBody")}
          action={
            <Button asChild>
              <Link href="/people/new">
                <Plus /> {t("people.add")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((pr) => {
            const img = pr.portrait_file_id ? `/api/files/${pr.portrait_file_id}` : pr.portrait_url;
            const years = [pr.birth_date?.slice(0, 4), pr.death_date?.slice(0, 4)]
              .filter(Boolean)
              .join("–");
            return (
              <li key={pr.id}>
                <Link
                  href={`/people/${pr.id}`}
                  className="card hover:border-border-strong flex items-center gap-3 p-4 transition-colors"
                >
                  <Avatar name={pr.full_name} image={img} className="size-12 text-sm" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{pr.full_name}</div>
                    <div className="text-muted truncate text-xs">
                      {[pr.short_description, years].filter(Boolean).join(" · ") ||
                        pr.roles.map((r) => t(`personRoles.${r}`)).join(", ")}
                    </div>
                    <div className="text-muted mt-0.5 text-xs">
                      {t("people.works", { count: pr.resource_count })}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={data.page}
        total={data.total}
        pageSize={data.pageSize}
        hrefFor={(n) =>
          `/people?${new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.role ? { role: f.role } : {}), sort: f.sort, page: String(n) })}`
        }
        labels={{
          previous: t("common.previous"),
          next: t("common.next"),
          page: t("common.page", { page: data.page, total: pages }),
        }}
      />
    </>
  );
}

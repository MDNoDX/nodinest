import { NotebookPen, Plus, Quote } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NoteRowActions } from "@/components/notes/note-row-actions";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { pageContext, sp, spInt, type SP } from "@/lib/page";
import { listMyTags, listNotes } from "@/server/notes";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("notes"))("title") };
}

export default async function NotesPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale, tz } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const tab = sp(p.tab) ?? "all";
  const tag = sp(p.tag) ?? null;
  const page = spInt(p.page);
  const [data, tags] = await Promise.all([
    listNotes(db, ctx, {
      kind: tab === "notes" ? "note" : tab === "quotes" ? "quote" : null,
      trash: tab === "trash",
      tag,
      page,
    }),
    listMyTags(db, ctx),
  ]);
  const tabs = [
    ["all", t("notes.all")],
    ["notes", t("notes.onlyNotes")],
    ["quotes", t("notes.onlyQuotes")],
    ["trash", t("notes.trash")],
  ] as const;
  const href = (o: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const merged = { tab, tag, ...o };
    for (const [k, val] of Object.entries(merged))
      if (val && !(k === "tab" && val === "all")) u.set(k, val);
    return `/notes${u.size ? `?${u}` : ""}`;
  };
  return (
    <>
      <PageHeader
        title={t("notes.title")}
        subtitle={t("notes.subtitle")}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/notes/new?kind=quote">
                <Quote /> {t("notes.newQuote")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/notes/new">
                <Plus /> {t("notes.new")}
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <nav className="bg-surface-2 inline-flex rounded-lg p-1" aria-label={t("common.filters")}>
          {tabs.map(([k, label]) => (
            <Link
              key={k}
              href={href({ tab: k, page: null })}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                tab === k ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tg) => (
              <Link
                key={tg.id}
                href={href({ tag: tag === tg.normalized ? null : tg.normalized, page: null })}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs",
                  tag === tg.normalized
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-muted hover:text-foreground",
                )}
              >
                #{tg.name} <span className="opacity-70">{tg.count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {data.items.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title={t("notes.emptyTitle")}
          body={t("notes.emptyBody")}
          action={
            <Button asChild>
              <Link href="/notes/new">
                <Plus /> {t("notes.new")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.items.map((n) => (
            <li key={n.id} className="card flex flex-col p-4">
              <Link href={`/notes/${n.id}`} className="flex-1 hover:opacity-90">
                {n.kind === "quote" ? (
                  <blockquote className="border-accent line-clamp-5 border-l-2 pl-3 font-serif text-[15px] leading-relaxed italic">
                    “{n.quoteText}”
                  </blockquote>
                ) : (
                  <>
                    {n.title && <h2 className="font-serif text-[15px] font-semibold">{n.title}</h2>}
                    <p className="text-foreground/85 mt-1 line-clamp-4 text-sm">{n.body}</p>
                  </>
                )}
                {n.kind === "quote" && n.body && (
                  <p className="text-muted mt-2 line-clamp-2 text-sm">{n.body}</p>
                )}
              </Link>
              <div className="text-muted mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {n.personName && <span>{t("notes.attributed", { name: n.personName })}</span>}
                {n.resourceTitle && (
                  <Link href={`/library/${n.resourceId}`} className="truncate hover:underline">
                    {n.resourceTitle}
                  </Link>
                )}
                {n.pageFrom != null && <span>· {t("notes.page", { page: n.pageFrom })}</span>}
                {n.visibility === "public" && <Badge tone="info">{t("common.public")}</Badge>}
                {n.tagNames.map((tg) => (
                  <span key={tg}>#{tg}</span>
                ))}
                <span className="ml-auto">{fmtDate(n.createdAt, locale, tz)}</span>
                {tab === "trash" && <NoteRowActions id={n.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={data.page}
        total={data.total}
        pageSize={data.pageSize}
        hrefFor={(n) => href({ page: String(n) })}
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

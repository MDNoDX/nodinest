import { FileText, Layers, NotebookPen, Plus, Quote, Trash2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NoteRowActions } from "@/components/notes/note-row-actions";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, HueBadge, PageHeader, Pagination } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { hueFor, hueStyle, TYPE_HUE } from "@/lib/hues";
import { normalizeTag } from "@/lib/normalize";
import { pageContext, sp, spInt, type SP } from "@/lib/page";
import { getResourceHeader } from "@/server/catalog";
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
  const rid = sp(p.resource);
  const resourceId = rid && /^[0-9a-f-]{36}$/i.test(rid) ? rid : null;
  const [data, tags, res] = await Promise.all([
    listNotes(db, ctx, {
      kind: tab === "notes" ? "note" : tab === "quotes" ? "quote" : null,
      trash: tab === "trash",
      tag,
      resourceId,
      page,
    }),
    listMyTags(db, ctx),
    resourceId ? getResourceHeader(db, ctx, resourceId) : Promise.resolve(null),
  ]);
  const tabs = [
    ["all", t("notes.all"), Layers, "blue"],
    ["notes", t("notes.onlyNotes"), FileText, "teal"],
    ["quotes", t("notes.onlyQuotes"), Quote, "violet"],
    ["trash", t("notes.trash"), Trash2, "slate"],
  ] as const;
  const href = (o: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, val] of Object.entries({ tab, tag, resource: resourceId, ...o }))
      if (val && !(k === "tab" && val === "all")) u.set(k, val);
    return `/notes${u.size ? `?${u}` : ""}`;
  };

  return (
    <>
      <PageHeader
        section="notes"
        eyebrow={
          res ? (
            <Link href={`/library/${resourceId}`} className="hover:underline">
              {res.title}
            </Link>
          ) : undefined
        }
        title={t("notes.title")}
        subtitle={res ? t("notes.forResource", { title: res.title }) : t("notes.subtitle")}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/notes/new?kind=quote${resourceId ? `&resource=${resourceId}` : ""}`}>
                <Quote /> {t("notes.newQuote")}
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/notes/new${resourceId ? `?resource=${resourceId}` : ""}`}>
                <Plus /> {t("notes.new")}
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        <nav className="flex flex-wrap gap-2" aria-label={t("common.filters")}>
          {tabs.map(([k, label, Icon, hue]) => {
            const on = tab === k;
            return (
              <Link
                key={k}
                href={href({ tab: k, page: null })}
                aria-current={on ? "page" : undefined}
                style={hueStyle(hue)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  on
                    ? "chip hue-border"
                    : "border-border bg-surface text-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" style={{ color: "var(--hue)" }} /> {label}
              </Link>
            );
          })}
        </nav>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tg) => {
              const on = tag === tg.normalized;
              return (
                <Link
                  key={tg.id}
                  href={href({ tag: on ? null : tg.normalized, page: null })}
                  style={hueStyle(hueFor(tg.normalized))}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-opacity",
                    on ? "hue-bar text-white" : "chip opacity-90 hover:opacity-100",
                  )}
                >
                  #{tg.name} <span className="opacity-70">{tg.count}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          hue="violet"
          icon={<NotebookPen />}
          title={t("notes.emptyTitle")}
          body={t("notes.emptyBody")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/notes/new">
                  <Plus /> {t("notes.new")}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/notes/new?kind=quote">
                  <Quote /> {t("notes.newQuote")}
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="columns-1 gap-4 md:columns-2 xl:columns-3">
          {data.items.map((n) => {
            const hue =
              n.kind === "quote"
                ? n.resourceType
                  ? TYPE_HUE[n.resourceType]
                  : "violet"
                : n.tagNames[0]
                  ? hueFor(normalizeTag(n.tagNames[0]))
                  : "blue";
            return (
              <li key={n.id} className="mb-4 break-inside-avoid" style={hueStyle(hue)}>
                <article className="card group relative overflow-hidden transition-shadow hover:shadow-md">
                  <span aria-hidden className="hue-bar absolute inset-y-0 left-0 w-1" />
                  <Link href={`/notes/${n.id}`} className="block px-5 pt-4 pb-3">
                    {n.kind === "quote" ? (
                      <>
                        <Quote
                          aria-hidden
                          className="mb-1 size-6"
                          style={{ color: "var(--hue)" }}
                        />
                        <blockquote className="font-serif text-[16px] leading-relaxed italic">
                          {n.quoteText}
                        </blockquote>
                        {n.body && (
                          <p className="text-muted border-border mt-3 line-clamp-3 border-t border-dashed pt-2 text-sm">
                            {n.body}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {n.title && (
                          <h2 className="text-[15px] font-semibold tracking-tight">{n.title}</h2>
                        )}
                        <p className="text-foreground/80 mt-1 line-clamp-6 text-sm leading-relaxed whitespace-pre-line">
                          {n.body}
                        </p>
                      </>
                    )}
                  </Link>
                  <footer className="hue-soft border-border flex flex-wrap items-center gap-1.5 border-t px-5 py-2.5 text-xs">
                    {n.personName && (
                      <span className="font-medium">
                        {t("notes.attributed", { name: n.personName })}
                      </span>
                    )}
                    {n.resourceTitle && (
                      <Link
                        href={`/library/${n.resourceId}`}
                        className="text-muted max-w-[14rem] truncate hover:underline"
                      >
                        {n.resourceTitle}
                        {n.pageFrom != null && ` · ${t("notes.page", { page: n.pageFrom })}`}
                      </Link>
                    )}
                    {n.visibility === "public" && <Badge tone="info">{t("common.public")}</Badge>}
                    {n.tagNames.map((tg) => (
                      <HueBadge key={tg} hue={hueFor(normalizeTag(tg))} className="px-1.5 py-0">
                        #{tg}
                      </HueBadge>
                    ))}
                    <span className="text-muted ml-auto">{fmtDate(n.createdAt, locale, tz)}</span>
                    {tab === "trash" && <NoteRowActions id={n.id} />}
                  </footer>
                </article>
              </li>
            );
          })}
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

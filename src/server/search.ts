/**
 * Universal search across people, resources, transcripts, notes, quotations,
 * konspekt sections, the text of indexed books (PDF/links), categories and tags.
 *
 * Matching: PostgreSQL full-text (prefix tsquery over apostrophe-normalised
 * 'simple' vectors, AND semantics across words) plus indexed substring match
 * on names/titles. All personal content is filtered by owner AND protected
 * by RLS, so private notes can never surface for another user.
 */
import { sql, type SQL } from "drizzle-orm";
import { withUser, type AppContext, type Database, type Tx } from "@/db/client";
import {
  escapeLike,
  makeSnippet,
  normalizeText,
  searchTokens,
  toPrefixTsQuery,
  type SnippetPart,
} from "@/lib/normalize";

export const SEARCH_GROUPS = [
  "resources",
  "people",
  "notes",
  "quotes",
  "transcripts",
  "conspect",
  "booktext",
  "categories",
  "tags",
] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export type SearchFilters = {
  q: string;
  group?: SearchGroup | null;
  resourceType?: string | null;
  personId?: string | null;
  categoryId?: string | null;
  status?: string | null;
  /** Limits in-book text and konspekt hits to one resource. */
  resourceId?: string | null;
  visibility?: "mine" | "public" | null;
  from?: string | null; // YYYY-MM-DD
  to?: string | null;
  sort?: "relevance" | "title" | "date" | "updated";
  page?: number;
};

export type SearchHit = {
  group: SearchGroup;
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  kind: string | null;
  snippet: SnippetPart[];
  date: string | null;
  rank: number;
};

export type GroupResult = { hits: SearchHit[]; total: number };

const PREVIEW_LIMIT = 5;
const PAGE_SIZE = 20;

function dateRange(col: SQL, from?: string | null, to?: string | null): SQL {
  const parts: SQL[] = [];
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) parts.push(sql`${col} >= ${from}::date`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) parts.push(sql`${col} < (${to}::date + 1)`);
  return parts.length ? sql` and ${sql.join(parts, sql` and `)}` : sql``;
}

function orderBy(sort: SearchFilters["sort"], cols: { title: SQL; date: SQL; updated: SQL }): SQL {
  switch (sort) {
    case "title":
      return sql`${cols.title} asc`;
    case "date":
      return sql`${cols.date} desc nulls last`;
    case "updated":
      return sql`${cols.updated} desc`;
    default:
      return sql`rank desc, ${cols.updated} desc`;
  }
}

type Q = { tsq: string; like: string; prefix: string; tokens: string[] };

async function searchResources(
  tx: Tx,
  ctx: AppContext,
  q: Q,
  f: SearchFilters,
  limit: number,
  offset: number,
): Promise<GroupResult> {
  const filters: SQL[] = [];
  if (f.resourceType) filters.push(sql`r.type = ${f.resourceType}`);
  if (f.personId)
    filters.push(
      sql`exists (select 1 from nodinest.resource_contributors c where c.resource_id = r.id and c.person_id = ${f.personId})`,
    );
  if (f.categoryId)
    filters.push(
      sql`exists (select 1 from nodinest.resource_categories rc where rc.resource_id = r.id and rc.category_id = ${f.categoryId})`,
    );
  if (f.status) filters.push(sql`lr.status = ${f.status}`);
  if (f.from) filters.push(sql`r.publication_date >= ${f.from.slice(0, 4)}`);
  if (f.to) filters.push(sql`left(r.publication_date, 4) <= ${f.to.slice(0, 4)}`);
  const extra = filters.length ? sql` and ${sql.join(filters, sql` and `)}` : sql``;
  const rows = await tx.execute<{
    id: string;
    title: string;
    type: string;
    description: string | null;
    publication_date: string | null;
    contributors: string | null;
    rank: number;
    total: number;
    updated_at: Date;
  }>(sql`
    select r.id, r.title, r.type::text, r.description, r.publication_date, r.updated_at,
      (select string_agg(p.full_name, ', ' order by c.position) from nodinest.resource_contributors c
        join nodinest.people p on p.id = c.person_id where c.resource_id = r.id) as contributors,
      (ts_rank(r.search, to_tsquery('simple', ${q.tsq}))
        + case when nodinest.nn_norm(r.title) like ${q.prefix} then 1 else 0 end
        + case when exists (select 1 from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
            where c.resource_id = r.id and p.search @@ to_tsquery('simple', ${q.tsq})) then 0.5 else 0 end) as rank,
      count(*) over() as total
    from nodinest.resources r
    left join nodinest.learning_records lr on lr.resource_id = r.id and lr.user_id = ${ctx.userId}
    where r.deleted_at is null and (
      r.search @@ to_tsquery('simple', ${q.tsq})
      or nodinest.nn_norm(r.title) like ${q.like}
      or exists (select 1 from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
                 where c.resource_id = r.id and p.search @@ to_tsquery('simple', ${q.tsq}))
    ) ${extra}
    order by ${orderBy(f.sort, { title: sql`r.title`, date: sql`r.publication_date`, updated: sql`r.updated_at` })}
    limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      group: "resources",
      id: r.id,
      href: `/library/${r.id}`,
      title: r.title,
      subtitle: r.contributors,
      kind: r.type,
      snippet: r.description ? makeSnippet(r.description, q.tokens, 60) : [],
      date: r.publication_date,
      rank: Number(r.rank),
    })),
  };
}

async function searchPeopleGroup(
  tx: Tx,
  q: Q,
  f: SearchFilters,
  limit: number,
  offset: number,
): Promise<GroupResult> {
  const rows = await tx.execute<{
    id: string;
    full_name: string;
    short_description: string | null;
    biography: string | null;
    birth_date: string | null;
    death_date: string | null;
    rank: number;
    total: number;
  }>(sql`
    select p.id, p.full_name, p.short_description, p.biography, p.birth_date, p.death_date,
      (ts_rank(p.search, to_tsquery('simple', ${q.tsq})) + case when nodinest.nn_norm(p.full_name) like ${q.prefix} then 1 else 0 end) as rank,
      count(*) over() as total
    from nodinest.people p
    where p.deleted_at is null and (
      p.search @@ to_tsquery('simple', ${q.tsq})
      or nodinest.nn_norm(p.full_name) like ${q.like}
      or exists (select 1 from nodinest.person_aliases a where a.person_id = p.id and nodinest.nn_norm(a.alias) like ${q.like})
    )
    order by ${orderBy(f.sort, { title: sql`p.full_name`, date: sql`p.birth_date`, updated: sql`p.updated_at` })}
    limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      group: "people",
      id: r.id,
      href: `/people/${r.id}`,
      title: r.full_name,
      subtitle: r.short_description,
      kind: null,
      snippet: r.biography ? makeSnippet(r.biography, q.tokens, 60) : [],
      date: r.birth_date,
      rank: Number(r.rank),
    })),
  };
}

async function searchNotesGroup(
  tx: Tx,
  ctx: AppContext,
  q: Q,
  f: SearchFilters,
  kind: "note" | "quote",
  limit: number,
  offset: number,
): Promise<GroupResult> {
  const owner =
    f.visibility === "public"
      ? sql`n.visibility = 'public' and n.user_id <> ${ctx.userId}`
      : sql`n.user_id = ${ctx.userId}`;
  const resFilter = f.resourceType ? sql` and r.type = ${f.resourceType}` : sql``;
  const personFilter = f.personId ? sql` and n.person_id = ${f.personId}` : sql``;
  const rows = await tx.execute<{
    id: string;
    title: string | null;
    body: string | null;
    quote_text: string | null;
    resource_title: string | null;
    person_name: string | null;
    created_at: Date;
    rank: number;
    total: number;
    location: string | null;
    page_from: number | null;
  }>(sql`
    select n.id, n.title, n.body, n.quote_text, r.title as resource_title, p.full_name as person_name, n.created_at,
      n.location, n.page_from,
      ts_rank(n.search, to_tsquery('simple', ${q.tsq})) as rank, count(*) over() as total
    from nodinest.notes n
    left join nodinest.resources r on r.id = n.resource_id
    left join nodinest.people p on p.id = n.person_id
    where ${owner} and n.deleted_at is null and n.kind = ${kind}
      and n.search @@ to_tsquery('simple', ${q.tsq}) ${resFilter} ${personFilter}
      ${dateRange(sql`n.created_at`, f.from, f.to)}
    order by ${orderBy(f.sort, { title: sql`coalesce(n.title, n.quote_text)`, date: sql`n.created_at`, updated: sql`n.updated_at` })}
    limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => {
      const main =
        kind === "quote" ? (r.quote_text ?? "") : [r.title, r.body].filter(Boolean).join(" — ");
      let snippet = makeSnippet(main, q.tokens, 80);
      if (!snippet.some((p) => p.match) && r.body) snippet = makeSnippet(r.body, q.tokens, 80);
      return {
        group: kind === "quote" ? "quotes" : "notes",
        id: r.id,
        href: `/notes/${r.id}`,
        title:
          kind === "quote"
            ? (r.person_name ?? r.resource_title ?? "")
            : (r.title ?? (r.body ?? "").slice(0, 80)),
        subtitle:
          [r.resource_title, r.page_from != null ? `p. ${r.page_from}` : null, r.location]
            .filter(Boolean)
            .join(" · ") || null,
        kind,
        snippet,
        date: new Date(r.created_at).toISOString(),
        rank: Number(r.rank),
      } satisfies SearchHit;
    }),
  };
}

async function searchTranscripts(
  tx: Tx,
  q: Q,
  f: SearchFilters,
  limit: number,
  offset: number,
): Promise<GroupResult> {
  const rows = await tx.execute<{
    id: string;
    title: string;
    type: string;
    transcript: string;
    rank: number;
    total: number;
  }>(sql`
    select r.id, r.title, r.type::text, m.transcript, ts_rank(m.search, to_tsquery('simple', ${q.tsq})) as rank, count(*) over() as total
    from nodinest.media_details m join nodinest.resources r on r.id = m.resource_id
    where r.deleted_at is null and m.transcript is not null and m.search @@ to_tsquery('simple', ${q.tsq})
      ${f.resourceType ? sql`and r.type = ${f.resourceType}` : sql``}
    order by rank desc limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      group: "transcripts",
      id: r.id,
      href: `/library/${r.id}#transcript`,
      title: r.title,
      subtitle: null,
      kind: r.type,
      snippet: makeSnippet(r.transcript, q.tokens, 90),
      date: null,
      rank: Number(r.rank),
    })),
  };
}

async function searchBookPages(
  tx: Tx,
  ctx: AppContext,
  q: Q,
  f: SearchFilters,
  limit: number,
  offset: number,
): Promise<GroupResult> {
  const rows = await tx.execute<{
    id: number;
    resource_id: string;
    title: string;
    type: string;
    page: number;
    content: string;
    file_id: string | null;
    url: string | null;
    rank: number;
    total: number;
  }>(sql`
    select bp.id, bp.resource_id, r.title, r.type::text, bp.page, bp.content, s.file_id, s.url,
      ts_rank(bp.search, to_tsquery('simple', ${q.tsq})) as rank, count(*) over() as total
    from nodinest.book_pages bp
      join nodinest.resources r on r.id = bp.resource_id
      join nodinest.book_text_sources s on s.id = bp.source_id
    where bp.user_id = ${ctx.userId} and bp.search @@ to_tsquery('simple', ${q.tsq})
      ${f.resourceType ? sql`and r.type = ${f.resourceType}` : sql``}
      ${f.resourceId ? sql`and bp.resource_id = ${f.resourceId}` : sql``}
    order by rank desc, bp.page asc
    limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      group: "booktext",
      id: String(r.id),
      // Opens the PDF itself at the matching page.
      href: r.file_id
        ? `/api/files/${r.file_id}#page=${r.page}`
        : r.url
          ? `${r.url}#page=${r.page}`
          : `/library/${r.resource_id}`,
      title: r.title,
      subtitle: `p. ${r.page}`,
      kind: r.type,
      snippet: makeSnippet(r.content, q.tokens, 120),
      date: null,
      rank: Number(r.rank),
    })),
  };
}

async function searchConspect(
  tx: Tx,
  ctx: AppContext,
  q: Q,
  f: SearchFilters,
  limit: number,
  offset: number,
): Promise<GroupResult> {
  const rows = await tx.execute<{
    id: string;
    resource_id: string;
    resource_title: string;
    title: string;
    content: string;
    rank: number;
    total: number;
  }>(sql`
    select c.id, c.resource_id, r.title as resource_title, c.title, c.content,
      ts_rank(c.search, to_tsquery('simple', ${q.tsq})) as rank, count(*) over() as total
    from nodinest.conspect_sections c join nodinest.resources r on r.id = c.resource_id
    where c.user_id = ${ctx.userId} and c.search @@ to_tsquery('simple', ${q.tsq})
      ${f.resourceId ? sql`and c.resource_id = ${f.resourceId}` : sql``}
    order by rank desc limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      group: "conspect",
      id: r.id,
      href: `/library/${r.resource_id}/konspekt?s=${r.id}`,
      title: r.title,
      subtitle: r.resource_title,
      kind: null,
      snippet: makeSnippet(r.content, q.tokens, 100),
      date: null,
      rank: Number(r.rank),
    })),
  };
}

async function searchCategories(tx: Tx, q: Q, limit: number, offset: number): Promise<GroupResult> {
  const rows = await tx.execute<{
    id: string;
    name_uz: string;
    name_en: string;
    slug: string;
    total: number;
  }>(sql`
    select id, name_uz, name_en, slug, count(*) over() as total from nodinest.categories
    where deleted_at is null and nodinest.nn_norm(name_uz || ' ' || name_en) like ${q.like}
    order by name_uz limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      group: "categories",
      id: r.id,
      href: `/library?category=${r.id}`,
      title: `${r.name_uz} / ${r.name_en}`,
      subtitle: null,
      kind: null,
      snippet: [],
      date: null,
      rank: 1,
    })),
  };
}

async function searchTags(
  tx: Tx,
  ctx: AppContext,
  q: Q,
  limit: number,
  offset: number,
): Promise<GroupResult> {
  const rows = await tx.execute<{
    id: string;
    name: string;
    normalized: string;
    owner_id: string | null;
    total: number;
  }>(sql`
    select id, name, normalized, owner_id, count(*) over() as total from nodinest.tags
    where (owner_id is null or owner_id = ${ctx.userId}) and normalized like ${q.like.replace(/ /g, "-")}
    order by name limit ${limit} offset ${offset}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      group: "tags",
      id: r.id,
      href: r.owner_id
        ? `/notes?tag=${encodeURIComponent(r.normalized)}`
        : `/search?q=${encodeURIComponent(r.name)}&group=resources`,
      title: `#${r.name}`,
      subtitle: null,
      kind: r.owner_id ? "personal" : "catalog",
      snippet: [],
      date: null,
      rank: 1,
    })),
  };
}

export async function universalSearch(database: Database, ctx: AppContext, f: SearchFilters) {
  const tokens = searchTokens(f.q);
  const tsq = toPrefixTsQuery(tokens);
  if (!tsq)
    return {
      query: f.q,
      groups: {} as Partial<Record<SearchGroup, GroupResult>>,
      tokens,
      page: 1,
      pageSize: PAGE_SIZE,
    };
  const norm = normalizeText(f.q);
  const q: Q = { tsq, tokens, like: `%${escapeLike(norm)}%`, prefix: `${escapeLike(norm)}%` };
  const page = Math.max(1, f.page ?? 1);
  const single = f.group ?? null;
  const limit = single ? PAGE_SIZE : PREVIEW_LIMIT;
  const offset = single ? (page - 1) * PAGE_SIZE : 0;

  return withUser(database, ctx, async (tx) => {
    const groups: Partial<Record<SearchGroup, GroupResult>> = {};
    const want = (g: SearchGroup) => !single || single === g;
    if (want("resources")) groups.resources = await searchResources(tx, ctx, q, f, limit, offset);
    if (want("people")) groups.people = await searchPeopleGroup(tx, q, f, limit, offset);
    if (want("notes")) groups.notes = await searchNotesGroup(tx, ctx, q, f, "note", limit, offset);
    if (want("quotes"))
      groups.quotes = await searchNotesGroup(tx, ctx, q, f, "quote", limit, offset);
    if (want("transcripts")) groups.transcripts = await searchTranscripts(tx, q, f, limit, offset);
    if (want("conspect")) groups.conspect = await searchConspect(tx, ctx, q, f, limit, offset);
    if (want("booktext")) groups.booktext = await searchBookPages(tx, ctx, q, f, limit, offset);
    if (want("categories")) groups.categories = await searchCategories(tx, q, limit, offset);
    if (want("tags")) groups.tags = await searchTags(tx, ctx, q, limit, offset);
    return { query: f.q, groups, tokens, page, pageSize: PAGE_SIZE };
  });
}

/** Lightweight command-palette search (titles/names only). */
export async function quickSearch(database: Database, ctx: AppContext, query: string) {
  const r = await universalSearch(database, ctx, { q: query, sort: "relevance" });
  const order: SearchGroup[] = ["resources", "people", "quotes", "notes", "categories"];
  return order.flatMap((g) => (r.groups[g]?.hits ?? []).slice(0, 4));
}

/**
 * Shared catalog: people and resources.
 *
 * Reads are available to every signed-in user. Writes are applied directly
 * only for superadmins; regular users' create/edit requests become
 * suggestions (src/server/suggestions.ts) that a superadmin approves, which
 * then calls the same `apply*` functions below inside one transaction.
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { withUser, type AppContext, type Database, type Tx } from "@/db/client";
import {
  bookDetails,
  publishers,
  categories,
  learningRecords,
  mediaDetails,
  notes,
  people,
  personAliases,
  personLinks,
  resourceCategories,
  resourceContributors,
  resourceIdentifiers,
  resourceLinks,
  resourceRelations,
  resources,
  resourceTags,
  tags,
} from "@/db/schema";
import { textArray } from "@/db/sql-helpers";
import { AppError } from "@/lib/errors";
import { ensurePublisher } from "./publishers";
import { duplicateKey, escapeLike, normalizeTag, normalizeText, parseIsbn } from "@/lib/normalize";
import {
  BOOK_LIKE,
  MEDIA_LIKE,
  personInput,
  resourceInput,
  zodFieldErrors,
  type PersonInput,
  type ResourceInput,
  type ResourceType,
} from "@/lib/validation";
import { audit } from "./audit";

/**
 * Catalog edit rule: the superadmin (in admin mode) may edit anything; every
 * other user may edit the entries they created. Everything else goes through
 * suggestions. RLS enforces the same rule (drizzle/0007_v2_rls.sql).
 */
export async function canEditCatalog(
  tx: Tx | Database,
  ctx: AppContext,
  type: "person" | "resource",
  id: string,
): Promise<boolean> {
  if (ctx.role === "superadmin") return true;
  const table = type === "person" ? people : resources;
  const [row] = await tx.select({ createdBy: table.createdBy }).from(table).where(eq(table.id, id));
  return !!row && row.createdBy === ctx.userId;
}

async function assertCanEdit(tx: Tx, ctx: AppContext, type: "person" | "resource", id: string) {
  if (!(await canEditCatalog(tx, ctx, type, id))) throw new AppError("FORBIDDEN");
}

export function parsePerson(input: unknown): PersonInput {
  const r = personInput.safeParse(input);
  if (!r.success)
    throw new AppError("VALIDATION", "invalid_person", { fieldErrors: zodFieldErrors(r.error) });
  return r.data;
}

export function parseResource(input: unknown): ResourceInput {
  const r = resourceInput.safeParse(input);
  if (!r.success)
    throw new AppError("VALIDATION", "invalid_resource", { fieldErrors: zodFieldErrors(r.error) });
  // Normalise ISBNs and reject invalid checksums.
  for (const id of r.data.identifiers) {
    if (id.scheme === "isbn10" || id.scheme === "isbn13") {
      const parsed = parseIsbn(id.value);
      if (!parsed)
        throw new AppError("VALIDATION", "invalid_isbn", {
          fieldErrors: { identifiers: ["invalid_isbn"] },
        });
      id.scheme = parsed.scheme;
      id.value = parsed.value;
    }
  }
  return r.data;
}

// ─── Autocomplete & duplicate detection ─────────────────────────────────────

export type PersonHit = {
  id: string;
  fullName: string;
  shortDescription: string | null;
  birthDate: string | null;
  deathDate: string | null;
  portraitUrl: string | null;
  matchedAlias: string | null;
};

/**
 * Prefix-first person search for autocomplete ("m" → people whose name, any
 * word of the name, or an alias starts with "m"), then substring/fuzzy.
 */
export async function searchPeople(
  tx: Tx | Database,
  query: string,
  limit = 8,
): Promise<PersonHit[]> {
  const q = normalizeText(query);
  if (!q) return [];
  const like = escapeLike(q);
  const rows = await tx.execute<{
    id: string;
    full_name: string;
    short_description: string | null;
    birth_date: string | null;
    death_date: string | null;
    portrait_url: string | null;
    matched_alias: string | null;
    rank: number;
  }>(sql`
    with candidates as (
      select p.id, null::text as matched_alias,
        case
          when nodinest.nn_norm(p.full_name) like ${like + "%"} then 0
          when nodinest.nn_norm(p.full_name) like ${"% " + like + "%"} then 1
          when nodinest.nn_norm(p.full_name) like ${"%" + like + "%"} then 3
          else 4
        end as rank,
        similarity(nodinest.nn_norm(p.full_name), ${q}) as sim
      from nodinest.people p
      where p.deleted_at is null and (
        nodinest.nn_norm(p.full_name) like ${"%" + like + "%"}
        or (length(${q}) >= 3 and nodinest.nn_norm(p.full_name) % ${q})
      )
      union all
      select a.person_id, a.alias,
        case when nodinest.nn_norm(a.alias) like ${like + "%"} then 2 else 3 end,
        similarity(nodinest.nn_norm(a.alias), ${q})
      from nodinest.person_aliases a
      where nodinest.nn_norm(a.alias) like ${"%" + like + "%"}
    ), best as (
      select distinct on (id) id, matched_alias, rank, sim
      from candidates order by id, rank, sim desc
    )
    select p.id, p.full_name, p.short_description, p.birth_date, p.death_date, p.portrait_url,
      b.matched_alias, b.rank
    from best b join nodinest.people p on p.id = b.id
    where p.deleted_at is null
    order by b.rank, b.sim desc, p.full_name
    limit ${limit}
  `);
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    shortDescription: r.short_description,
    birthDate: r.birth_date,
    deathDate: r.death_date,
    portraitUrl: r.portrait_url,
    matchedAlias: r.matched_alias,
  }));
}

export type DuplicateCandidate = { id: string; label: string; reason: string; score: number };

export async function findDuplicatePeople(
  tx: Tx | Database,
  input: { fullName: string; aliases?: string[]; birthDate?: string | null },
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const names = [input.fullName, ...(input.aliases ?? [])].map(duplicateKey).filter(Boolean);
  if (names.length === 0) return [];
  const namesArr = textArray(names);
  const rows = await tx.execute<{
    id: string;
    full_name: string;
    birth_date: string | null;
    score: number;
  }>(sql`
    select p.id, p.full_name, p.birth_date,
      greatest(
        (select max(similarity(nodinest.nn_norm(p.full_name), n)) from unnest(${namesArr}) n),
        coalesce((select max(similarity(nodinest.nn_norm(a.alias), n))
          from nodinest.person_aliases a, unnest(${namesArr}) n where a.person_id = p.id), 0)
      ) as score
    from nodinest.people p
    where p.deleted_at is null
      ${excludeId ? sql`and p.id <> ${excludeId}` : sql``}
      and (
        nodinest.nn_norm(p.full_name) % any(${namesArr})
        or exists (select 1 from nodinest.person_aliases a
                   where a.person_id = p.id and nodinest.nn_norm(a.alias) % any(${namesArr}))
      )
    order by score desc
    limit 5
  `);
  return rows
    .filter((r) => r.score >= 0.55)
    .map((r) => {
      const sameBirth = !!input.birthDate && r.birth_date === input.birthDate;
      return {
        id: r.id,
        label: r.full_name,
        reason: sameBirth ? "name_and_birth_date" : r.score >= 0.95 ? "same_name" : "similar_name",
        score: Math.min(1, Number(r.score) + (sameBirth ? 0.2 : 0)),
      };
    });
}

export async function findDuplicateResources(
  tx: Tx | Database,
  input: {
    type: ResourceType;
    title: string;
    identifiers?: { scheme: string; value: string }[];
    sourceUrl?: string | null;
  },
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const out = new Map<string, DuplicateCandidate>();
  for (const ident of input.identifiers ?? []) {
    const rows = await tx
      .select({ id: resources.id, title: resources.title })
      .from(resourceIdentifiers)
      .innerJoin(resources, eq(resources.id, resourceIdentifiers.resourceId))
      .where(
        and(
          eq(resourceIdentifiers.scheme, ident.scheme as never),
          eq(resourceIdentifiers.value, ident.value),
          isNull(resources.deletedAt),
        ),
      );
    for (const r of rows)
      if (r.id !== excludeId)
        out.set(r.id, { id: r.id, label: r.title, reason: "same_identifier", score: 1 });
  }
  if (input.sourceUrl) {
    const rows = await tx
      .select({ id: resources.id, title: resources.title })
      .from(resources)
      .where(and(eq(resources.sourceUrl, input.sourceUrl), isNull(resources.deletedAt)));
    for (const r of rows)
      if (r.id !== excludeId && !out.has(r.id))
        out.set(r.id, { id: r.id, label: r.title, reason: "same_source_url", score: 0.95 });
  }
  const key = duplicateKey(input.title);
  if (key) {
    const rows = await tx.execute<{ id: string; title: string; type: string; score: number }>(sql`
      select r.id, r.title, r.type, similarity(nodinest.nn_norm(r.title), ${key}) as score
      from nodinest.resources r
      where r.deleted_at is null and nodinest.nn_norm(r.title) % ${key}
        ${excludeId ? sql`and r.id <> ${excludeId}` : sql``}
      order by score desc limit 5
    `);
    for (const r of rows) {
      const score = Number(r.score) * (r.type === input.type ? 1 : 0.8);
      if (score >= 0.6 && !out.has(r.id))
        out.set(r.id, {
          id: r.id,
          label: r.title,
          reason: score >= 0.95 ? "same_title" : "similar_title",
          score,
        });
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

// ─── Apply (superadmin-only, inside a transaction) ──────────────────────────

async function setPersonChildren(tx: Tx, personId: string, data: PersonInput) {
  await tx.delete(personAliases).where(eq(personAliases.personId, personId));
  const aliases = [
    ...new Set(data.aliases.map((a) => a.trim()).filter((a) => a && a !== data.fullName)),
  ];
  if (aliases.length)
    await tx.insert(personAliases).values(aliases.map((alias) => ({ personId, alias })));
  await tx.delete(personLinks).where(eq(personLinks.personId, personId));
  if (data.links.length)
    await tx
      .insert(personLinks)
      .values(data.links.map((l) => ({ personId, kind: l.kind, url: l.url, label: l.label })));
}

function personRow(data: PersonInput) {
  return {
    fullName: data.fullName,
    shortDescription: data.shortDescription,
    biography: data.biography,
    birthDate: data.birthDate,
    deathDate: data.deathDate,
    nationality: data.nationality,
    roles: data.roles,
    activityAreas: data.activityAreas,
    portraitUrl: data.portraitUrl,
    portraitFileId: data.portraitFileId ?? null,
    websiteUrl: data.websiteUrl,
    verification: data.verification,
  };
}

export async function applyCreatePerson(
  tx: Tx,
  ctx: AppContext,
  data: PersonInput,
  meta?: Record<string, unknown>,
) {
  const [row] = await tx
    .insert(people)
    .values({ ...personRow(data), createdBy: ctx.userId, updatedBy: ctx.userId })
    .returning({ id: people.id });
  await setPersonChildren(tx, row.id, data);
  await audit(tx, {
    actorId: ctx.userId,
    action: "person.create",
    entityType: "person",
    entityId: row.id,
    after: data,
    meta,
  });
  return row.id;
}

export async function applyUpdatePerson(
  tx: Tx,
  ctx: AppContext,
  id: string,
  data: PersonInput,
  meta?: Record<string, unknown>,
) {
  await assertCanEdit(tx, ctx, "person", id);
  const before = await getPersonSnapshot(tx, id);
  if (!before) throw new AppError("NOT_FOUND");
  await tx
    .update(people)
    .set({ ...personRow(data), updatedBy: ctx.userId })
    .where(eq(people.id, id));
  await setPersonChildren(tx, id, data);
  await audit(tx, {
    actorId: ctx.userId,
    action: "person.update",
    entityType: "person",
    entityId: id,
    before,
    after: data,
    meta,
  });
}

export async function applyArchive(
  tx: Tx,
  ctx: AppContext,
  type: "person" | "resource",
  id: string,
  archived: boolean,
  meta?: Record<string, unknown>,
) {
  await assertCanEdit(tx, ctx, type, id);
  const table = type === "person" ? people : resources;
  const res = await tx
    .update(table)
    .set({ deletedAt: archived ? new Date() : null, updatedBy: ctx.userId })
    .where(eq(table.id, id))
    .returning({ id: table.id });
  if (res.length === 0) throw new AppError("NOT_FOUND");
  await audit(tx, {
    actorId: ctx.userId,
    action: `${type}.${archived ? "archive" : "restore"}`,
    entityType: type,
    entityId: id,
    meta,
  });
}

async function resolveContributors(tx: Tx, ctx: AppContext, data: ResourceInput) {
  const out: {
    personId: string;
    role: ResourceInput["contributors"][number]["role"];
    position: number;
  }[] = [];
  let pos = 0;
  for (const c of data.contributors) {
    let personId = c.personId ?? null;
    if (!personId && c.newPersonName) {
      // Reuse an exact existing match rather than creating a duplicate.
      const existing = await tx.execute<{ id: string }>(sql`
        select id from nodinest.people
        where deleted_at is null and nodinest.nn_norm(full_name) = ${normalizeText(c.newPersonName)} limit 1`);
      personId =
        existing[0]?.id ??
        (await applyCreatePerson(
          tx,
          ctx,
          personInput.parse({ fullName: c.newPersonName, roles: [] }),
          {
            via: "resource_contributor",
          },
        ));
    }
    if (personId && !out.some((o) => o.personId === personId && o.role === c.role))
      out.push({ personId, role: c.role, position: pos++ });
  }
  return out;
}

async function ensureCatalogTags(tx: Tx, names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const normalized = normalizeTag(name);
    if (!normalized) continue;
    const [row] = await tx
      .insert(tags)
      .values({ ownerId: null, name: name.trim(), normalized })
      .onConflictDoUpdate({ target: [tags.ownerId, tags.normalized], set: { normalized } })
      .returning({ id: tags.id });
    ids.push(row.id);
  }
  return [...new Set(ids)];
}

async function setResourceChildren(tx: Tx, ctx: AppContext, id: string, data: ResourceInput) {
  // Type-specific details
  await tx.delete(bookDetails).where(eq(bookDetails.resourceId, id));
  await tx.delete(mediaDetails).where(eq(mediaDetails.resourceId, id));
  if (BOOK_LIKE.includes(data.type) && data.book) {
    const { publisherId, publisherName, ...book } = data.book;
    const pid =
      publisherId ?? (publisherName ? await ensurePublisher(tx, ctx, publisherName) : null);
    await tx.insert(bookDetails).values({ resourceId: id, ...book, publisherId: pid });
  }
  if (MEDIA_LIKE.includes(data.type) && data.media) {
    // "Where" (channel / podcast / site) is linked to its entry in
    // "Nashriyot va kanallar", created on first use.
    const where = data.media.channel?.trim();
    const kind =
      data.type === "podcast" ? "podcast" : data.type === "article" ? "website" : "channel";
    const pid = where ? await ensurePublisher(tx, ctx, where, kind) : null;
    await tx.insert(mediaDetails).values({ resourceId: id, ...data.media, publisherId: pid });
  }
  // Contributors
  const contributors = await resolveContributors(tx, ctx, data);
  await tx.delete(resourceContributors).where(eq(resourceContributors.resourceId, id));
  if (contributors.length)
    await tx
      .insert(resourceContributors)
      .values(contributors.map((c) => ({ resourceId: id, ...c })));
  // Identifiers
  await tx.delete(resourceIdentifiers).where(eq(resourceIdentifiers.resourceId, id));
  if (data.identifiers.length)
    await tx
      .insert(resourceIdentifiers)
      .values(data.identifiers.map((i) => ({ resourceId: id, ...i })));
  // Links
  await tx.delete(resourceLinks).where(eq(resourceLinks.resourceId, id));
  if (data.links.length)
    await tx
      .insert(resourceLinks)
      .values(
        data.links.map((l) => ({ resourceId: id, kind: l.kind, url: l.url, label: l.label })),
      );
  // Categories (only existing, non-archived ones)
  await tx.delete(resourceCategories).where(eq(resourceCategories.resourceId, id));
  if (data.categoryIds.length) {
    const valid = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, data.categoryIds), isNull(categories.deletedAt)));
    if (valid.length)
      await tx
        .insert(resourceCategories)
        .values(valid.map((c) => ({ resourceId: id, categoryId: c.id })));
  }
  // Catalog tags
  await tx.delete(resourceTags).where(eq(resourceTags.resourceId, id));
  const tagIds = await ensureCatalogTags(tx, data.tags);
  if (tagIds.length)
    await tx.insert(resourceTags).values(tagIds.map((tagId) => ({ resourceId: id, tagId })));
}

function resourceRow(data: ResourceInput) {
  return {
    type: data.type,
    title: data.title,
    originalTitle: data.originalTitle,
    description: data.description,
    coverUrl: data.coverUrl,
    coverFileId: data.coverFileId ?? null,
    language: data.language,
    publicationDate: data.publicationDate,
    originalDate: data.originalDate,
    sourceUrl: data.sourceUrl,
    verification: data.verification,
  };
}

export async function applyCreateResource(
  tx: Tx,
  ctx: AppContext,
  data: ResourceInput,
  meta?: Record<string, unknown>,
) {
  const [row] = await tx
    .insert(resources)
    .values({ ...resourceRow(data), createdBy: ctx.userId, updatedBy: ctx.userId })
    .returning({ id: resources.id });
  await setResourceChildren(tx, ctx, row.id, data);
  await audit(tx, {
    actorId: ctx.userId,
    action: "resource.create",
    entityType: "resource",
    entityId: row.id,
    after: data,
    meta,
  });
  return row.id;
}

export async function applyUpdateResource(
  tx: Tx,
  ctx: AppContext,
  id: string,
  data: ResourceInput,
  meta?: Record<string, unknown>,
) {
  await assertCanEdit(tx, ctx, "resource", id);
  const before = await getResourceSnapshot(tx, id);
  if (!before) throw new AppError("NOT_FOUND");
  await tx
    .update(resources)
    .set({ ...resourceRow(data), updatedBy: ctx.userId })
    .where(eq(resources.id, id));
  await setResourceChildren(tx, ctx, id, data);
  await audit(tx, {
    actorId: ctx.userId,
    action: "resource.update",
    entityType: "resource",
    entityId: id,
    before,
    after: data,
    meta,
  });
}

// ─── Snapshots (editable shape, used for forms, diffs and suggestions) ──────

export async function getPersonSnapshot(
  tx: Tx | Database,
  id: string,
): Promise<PersonInput | null> {
  const [p] = await tx.select().from(people).where(eq(people.id, id));
  if (!p) return null;
  const aliases = await tx
    .select({ alias: personAliases.alias })
    .from(personAliases)
    .where(eq(personAliases.personId, id));
  const links = await tx
    .select({ kind: personLinks.kind, url: personLinks.url, label: personLinks.label })
    .from(personLinks)
    .where(eq(personLinks.personId, id));
  return {
    fullName: p.fullName,
    aliases: aliases.map((a) => a.alias),
    shortDescription: p.shortDescription,
    biography: p.biography,
    birthDate: p.birthDate,
    deathDate: p.deathDate,
    nationality: p.nationality,
    roles: p.roles as PersonInput["roles"],
    activityAreas: p.activityAreas,
    portraitUrl: p.portraitUrl,
    portraitFileId: p.portraitFileId,
    websiteUrl: p.websiteUrl,
    links,
    verification: p.verification,
  };
}

export async function getResourceSnapshot(
  tx: Tx | Database,
  id: string,
): Promise<ResourceInput | null> {
  const [r] = await tx.select().from(resources).where(eq(resources.id, id));
  if (!r) return null;
  const [book] = await tx.select().from(bookDetails).where(eq(bookDetails.resourceId, id));
  const [media] = await tx.select().from(mediaDetails).where(eq(mediaDetails.resourceId, id));
  const contributors = await tx
    .select({ personId: resourceContributors.personId, role: resourceContributors.role })
    .from(resourceContributors)
    .where(eq(resourceContributors.resourceId, id))
    .orderBy(asc(resourceContributors.position));
  const identifiers = await tx
    .select({ scheme: resourceIdentifiers.scheme, value: resourceIdentifiers.value })
    .from(resourceIdentifiers)
    .where(eq(resourceIdentifiers.resourceId, id));
  const links = await tx
    .select({ kind: resourceLinks.kind, url: resourceLinks.url, label: resourceLinks.label })
    .from(resourceLinks)
    .where(eq(resourceLinks.resourceId, id));
  const cats = await tx
    .select({ id: resourceCategories.categoryId })
    .from(resourceCategories)
    .where(eq(resourceCategories.resourceId, id));
  const tagRows = await tx
    .select({ name: tags.name })
    .from(resourceTags)
    .innerJoin(tags, eq(tags.id, resourceTags.tagId))
    .where(eq(resourceTags.resourceId, id));
  return {
    type: r.type,
    title: r.title,
    originalTitle: r.originalTitle,
    description: r.description,
    coverUrl: r.coverUrl,
    coverFileId: r.coverFileId,
    language: r.language,
    publicationDate: r.publicationDate,
    originalDate: r.originalDate,
    sourceUrl: r.sourceUrl,
    verification: r.verification,
    contributors: contributors.map((c) => ({
      personId: c.personId,
      newPersonName: null,
      role: c.role,
    })),
    categoryIds: cats.map((c) => c.id),
    tags: tagRows.map((t) => t.name),
    identifiers,
    links,
    book: book
      ? {
          publisherId: book.publisherId,
          publisherName: null,
          pageCount: book.pageCount,
          originalLanguage: book.originalLanguage,
          readingUrl: book.readingUrl,
        }
      : null,
    media: media
      ? {
          platform: media.platform,
          channel: media.channel,
          durationSeconds: media.durationSeconds,
          lessonCount: media.lessonCount,
          transcript: media.transcript,
          transcriptUrl: media.transcriptUrl,
        }
      : null,
  };
}

// ─── Read models for pages ──────────────────────────────────────────────────

export type ResourceListItem = {
  id: string;
  type: ResourceType;
  title: string;
  coverUrl: string | null;
  coverFileId: string | null;
  publicationDate: string | null;
  contributors: string;
  myStatus: string | null;
  myRating: number | null;
  updatedAt: Date;
  readYear: number | null;
  writtenYear: number | null;
};

/** Years in which the user finished something (newest first), for the library filter. */
export async function listReadYears(database: Database, ctx: AppContext, timeZone: string) {
  const rows = await withUser(database, ctx, (tx) =>
    tx.execute<{ y: number }>(sql`
      select distinct extract(year from lr.completed_at at time zone ${timeZone})::int as y
      from nodinest.learning_records lr
      join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
      where lr.user_id = ${ctx.userId} and lr.status = 'completed' and lr.completed_at is not null
      order by 1 desc`),
  );
  return rows.map((r) => r.y);
}

export const LIBRARY_SORTS = ["updated", "added", "title", "read", "year", "date"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** First year of a flexible date text ("1150~" → 1150, "1101/1200" → 1101, "-300" → -300). */
const yearOf = (col: SQL) => sql`nullif(substring(${col} from '^-?[0-9]+'), '')::int`;

export type LibraryFilters = {
  q?: string;
  type?: ResourceType | null;
  status?: string | null; // my learning status, "none" = not in my library
  /** "mine" = only what is in my library (default on the Library page). */
  scope?: "mine" | "all";
  categoryId?: string | null;
  personId?: string | null;
  sort?: LibrarySort;
  /** Finished in this calendar year (user's time zone). */
  readYear?: number | null;
  timeZone?: string;
  archived?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listResources(database: Database, ctx: AppContext, f: LibraryFilters) {
  const pageSize = Math.min(f.pageSize ?? 24, 60);
  const page = Math.max(1, f.page ?? 1);
  return withUser(database, ctx, async (tx) => {
    const conds: SQL[] = [];
    conds.push(
      f.archived && ctx.role === "superadmin"
        ? sql`r.deleted_at is not null`
        : sql`r.deleted_at is null`,
    );
    // The user's own books live in "Kitob yozish", not in the Darsxona.
    conds.push(sql`not exists (select 1 from nodinest.own_books o where o.resource_id = r.id)`);
    if (f.type) conds.push(sql`r.type = ${f.type}`);
    if (f.categoryId)
      conds.push(
        sql`exists (select 1 from nodinest.resource_categories rc where rc.resource_id = r.id and rc.category_id = ${f.categoryId})`,
      );
    if (f.personId)
      conds.push(
        sql`exists (select 1 from nodinest.resource_contributors c where c.resource_id = r.id and c.person_id = ${f.personId})`,
      );
    if (f.status === "none") conds.push(sql`lr.id is null`);
    else if (f.status === "paused") conds.push(sql`lr.status in ('paused', 'abandoned')`);
    else if (f.status) conds.push(sql`lr.status = ${f.status}`);
    else if (f.scope === "mine") conds.push(sql`lr.id is not null`);
    const q = f.q ? normalizeText(f.q) : "";
    if (q) {
      const like = `%${escapeLike(q)}%`;
      conds.push(sql`(nodinest.nn_norm(r.title) like ${like} or nodinest.nn_norm(coalesce(r.original_title, '')) like ${like}
        or exists (select 1 from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
                   where c.resource_id = r.id and nodinest.nn_norm(p.full_name) like ${like}))`);
    }
    const tz = f.timeZone ?? "UTC";
    const readYear = sql`extract(year from lr.completed_at at time zone ${tz})::int`;
    if (f.readYear) conds.push(sql`lr.status = 'completed' and ${readYear} = ${f.readYear}`);
    const where = sql.join(conds, sql` and `);
    const writtenYear = yearOf(sql`coalesce(r.original_date, r.publication_date)`);
    const order =
      f.sort === "title"
        ? sql`r.title asc`
        : f.sort === "date"
          ? sql`${yearOf(sql`r.publication_date`)} desc nulls last, r.publication_date desc, r.title`
          : f.sort === "year"
            ? sql`${writtenYear} asc nulls last, r.title`
            : f.sort === "read"
              ? sql`(lr.status = 'completed') desc nulls last, lr.completed_at desc nulls last, r.title`
              : f.sort === "added"
                ? sql`r.created_at desc`
                : sql`r.updated_at desc`;
    const rows = await tx.execute<{
      id: string;
      type: ResourceType;
      title: string;
      cover_url: string | null;
      cover_file_id: string | null;
      publication_date: string | null;
      contributors: string | null;
      my_status: string | null;
      my_rating: number | null;
      updated_at: Date;
      read_year: number | null;
      written_year: number | null;
      total: number;
    }>(sql`
      select r.id, r.type, r.title, r.cover_url, r.cover_file_id, r.publication_date, r.updated_at,
        case when lr.status = 'completed' then ${readYear} end as read_year,
        ${writtenYear} as written_year,
        lr.status as my_status, lr.rating as my_rating,
        (select string_agg(p.full_name, ', ' order by c.position)
           from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
          where c.resource_id = r.id) as contributors,
        count(*) over() as total
      from nodinest.resources r
      left join nodinest.learning_records lr on lr.resource_id = r.id and lr.user_id = ${ctx.userId}
      where ${where}
      order by ${order}
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `);
    return {
      items: rows.map<ResourceListItem>((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        coverUrl: r.cover_url,
        coverFileId: r.cover_file_id,
        publicationDate: r.publication_date,
        contributors: r.contributors ?? "",
        myStatus:
          r.my_status === "abandoned" || r.my_status === "paused" ? "in_progress" : r.my_status,
        myRating: r.my_rating,
        updatedAt: new Date(r.updated_at),
        readYear: r.read_year,
        writtenYear: r.written_year,
      })),
      total: Number(rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  });
}

export async function getResourceDetail(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const [r] = await tx.select().from(resources).where(eq(resources.id, id));
    if (!r || (r.deletedAt && ctx.role !== "superadmin")) return null;
    // Independent reads are issued together: postgres-js pipelines them on the
    // transaction's connection, so the page waits ~1 round-trip instead of 10.
    const bookQ = tx
      .select({
        publisherId: bookDetails.publisherId,
        publisherName: publishers.name,
        pageCount: bookDetails.pageCount,
        originalLanguage: bookDetails.originalLanguage,
        readingUrl: bookDetails.readingUrl,
      })
      .from(bookDetails)
      .leftJoin(publishers, eq(publishers.id, bookDetails.publisherId))
      .where(eq(bookDetails.resourceId, id));
    const mediaQ = tx.select().from(mediaDetails).where(eq(mediaDetails.resourceId, id));
    const contributorsQ = tx
      .select({
        id: people.id,
        fullName: people.fullName,
        role: resourceContributors.role,
        portraitUrl: people.portraitUrl,
      })
      .from(resourceContributors)
      .innerJoin(people, eq(people.id, resourceContributors.personId))
      .where(eq(resourceContributors.resourceId, id))
      .orderBy(asc(resourceContributors.position));
    const identifiersQ = tx
      .select()
      .from(resourceIdentifiers)
      .where(eq(resourceIdentifiers.resourceId, id));
    const linksQ = tx.select().from(resourceLinks).where(eq(resourceLinks.resourceId, id));
    const catsQ = tx
      .select({
        id: categories.id,
        nameUz: categories.nameUz,
        nameEn: categories.nameEn,
        nameRu: categories.nameRu,
        slug: categories.slug,
      })
      .from(resourceCategories)
      .innerJoin(categories, eq(categories.id, resourceCategories.categoryId))
      .where(eq(resourceCategories.resourceId, id));
    const tagsQ = tx
      .select({ id: tags.id, name: tags.name })
      .from(resourceTags)
      .innerJoin(tags, eq(tags.id, resourceTags.tagId))
      .where(eq(resourceTags.resourceId, id));
    const relatedQ = tx.execute<{
      id: string;
      title: string;
      type: ResourceType;
      kind: string;
      reason: string;
    }>(sql`
      (select r2.id, r2.title, r2.type, rel.kind::text as kind, 'relation' as reason
         from nodinest.resource_relations rel join nodinest.resources r2 on r2.id = rel.to_id
        where rel.from_id = ${id} and r2.deleted_at is null)
      union
      (select r2.id, r2.title, r2.type, rel.kind::text, 'relation'
         from nodinest.resource_relations rel join nodinest.resources r2 on r2.id = rel.from_id
        where rel.to_id = ${id} and r2.deleted_at is null)
      union
      (select distinct r2.id, r2.title, r2.type, 'same_contributor', 'contributor'
         from nodinest.resource_contributors c1
         join nodinest.resource_contributors c2 on c2.person_id = c1.person_id and c2.resource_id <> c1.resource_id
         join nodinest.resources r2 on r2.id = c2.resource_id
        where c1.resource_id = ${id} and r2.deleted_at is null
        limit 8)
    `);
    const recordQ = tx
      .select()
      .from(learningRecords)
      .where(and(eq(learningRecords.resourceId, id), eq(learningRecords.userId, ctx.userId)));
    const myNotesQ = tx
      .select()
      .from(notes)
      .where(and(eq(notes.resourceId, id), eq(notes.userId, ctx.userId), isNull(notes.deletedAt)))
      .orderBy(desc(notes.createdAt))
      .limit(50);
    const publicNotesQ = tx
      .select({
        id: notes.id,
        kind: notes.kind,
        quoteText: notes.quoteText,
        body: notes.body,
        title: notes.title,
        pageFrom: notes.pageFrom,
        pageTo: notes.pageTo,
        location: notes.location,
      })
      .from(notes)
      .where(
        and(
          eq(notes.resourceId, id),
          eq(notes.visibility, "public"),
          isNull(notes.deletedAt),
          sql`${notes.userId} <> ${ctx.userId}`,
        ),
      )
      .orderBy(desc(notes.createdAt))
      .limit(20);
    const mineQ = tx.execute<{
      words: number | null;
      headings: string[] | null;
      text_pages: number;
      text_status: string | null;
    }>(sql`
      select
        (select w.words from nodinest.writeups w where w.user_id = ${ctx.userId} and w.resource_id = ${id}) as words,
        (select array(select h->'content'->0->>'text'
           from nodinest.writeups w, jsonb_array_elements(w.doc->'content') h
          where w.user_id = ${ctx.userId} and w.resource_id = ${id} and h->>'type' = 'heading' limit 12)) as headings,
        (select coalesce(sum(pages), 0)::int from nodinest.book_text_sources b where b.user_id = ${ctx.userId} and b.resource_id = ${id} and b.status = 'ready') as text_pages,
        (select b.status::text from nodinest.book_text_sources b where b.user_id = ${ctx.userId} and b.resource_id = ${id} order by b.updated_at desc limit 1) as text_status`);
    const [
      [book],
      [media],
      contributors,
      identifiers,
      links,
      cats,
      tagRows,
      relatedRows,
      [record],
      myNotes,
      publicNotes,
      [mine],
    ] = await Promise.all([
      bookQ,
      mediaQ,
      contributorsQ,
      identifiersQ,
      linksQ,
      catsQ,
      tagsQ,
      relatedQ,
      recordQ,
      myNotesQ,
      publicNotesQ,
      mineQ,
    ]);
    return {
      resource: r,
      book: book ?? null,
      media: media ?? null,
      contributors,
      identifiers,
      links,
      categories: cats,
      tags: tagRows,
      related: relatedRows,
      record: record ?? null,
      myNotes,
      publicNotes,
      mine: {
        writeupWords: mine?.words ?? null,
        writeupHeadings: (mine?.headings ?? []).filter(Boolean),
        textPages: mine?.text_pages ?? 0,
        textStatus: mine?.text_status ?? null,
      },
      canEdit: ctx.role === "superadmin" || r.createdBy === ctx.userId,
    };
  });
}

export async function listPeople(
  database: Database,
  ctx: AppContext,
  f: {
    q?: string;
    role?: string | null;
    sort?: "name" | "updated";
    page?: number;
    archived?: boolean;
  },
) {
  const pageSize = 30;
  const page = Math.max(1, f.page ?? 1);
  return withUser(database, ctx, async (tx) => {
    const conds: SQL[] = [
      f.archived && ctx.role === "superadmin"
        ? sql`p.deleted_at is not null`
        : sql`p.deleted_at is null`,
    ];
    if (f.role) conds.push(sql`${f.role} = any(p.roles)`);
    const q = f.q ? normalizeText(f.q) : "";
    if (q) {
      const like = `%${escapeLike(q)}%`;
      conds.push(sql`(nodinest.nn_norm(p.full_name) like ${like} or exists (
        select 1 from nodinest.person_aliases a where a.person_id = p.id and nodinest.nn_norm(a.alias) like ${like}))`);
    }
    const rows = await tx.execute<{
      id: string;
      full_name: string;
      short_description: string | null;
      birth_date: string | null;
      death_date: string | null;
      portrait_url: string | null;
      portrait_file_id: string | null;
      roles: string[];
      resource_count: number;
      total: number;
    }>(sql`
      select p.id, p.full_name, p.short_description, p.birth_date, p.death_date, p.portrait_url, p.portrait_file_id, p.roles,
        (select count(distinct c.resource_id)::int from nodinest.resource_contributors c
          join nodinest.resources r on r.id = c.resource_id and r.deleted_at is null
          where c.person_id = p.id) as resource_count,
        count(*) over() as total
      from nodinest.people p
      where ${sql.join(conds, sql` and `)}
      order by ${f.sort === "updated" ? sql`p.updated_at desc` : sql`p.full_name asc`}
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `);
    return { items: rows, total: Number(rows[0]?.total ?? 0), page, pageSize };
  });
}

export async function getPersonDetail(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const [p] = await tx.select().from(people).where(eq(people.id, id));
    if (!p || (p.deletedAt && ctx.role !== "superadmin")) return null;
    const aliases = await tx.select().from(personAliases).where(eq(personAliases.personId, id));
    const links = await tx.select().from(personLinks).where(eq(personLinks.personId, id));
    const works = await tx
      .select({
        id: resources.id,
        title: resources.title,
        type: resources.type,
        publicationDate: resources.publicationDate,
        coverUrl: resources.coverUrl,
        coverFileId: resources.coverFileId,
        role: resourceContributors.role,
        myStatus: learningRecords.status,
      })
      .from(resourceContributors)
      .innerJoin(resources, eq(resources.id, resourceContributors.resourceId))
      .leftJoin(
        learningRecords,
        and(eq(learningRecords.resourceId, resources.id), eq(learningRecords.userId, ctx.userId)),
      )
      .where(and(eq(resourceContributors.personId, id), isNull(resources.deletedAt)))
      .orderBy(sql`${resources.publicationDate} desc nulls last`, asc(resources.title));
    const quotes = await tx
      .select({
        id: notes.id,
        quoteText: notes.quoteText,
        resourceId: notes.resourceId,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .where(
        and(
          eq(notes.personId, id),
          eq(notes.userId, ctx.userId),
          isNull(notes.deletedAt),
          eq(notes.kind, "quote"),
        ),
      )
      .orderBy(desc(notes.createdAt))
      .limit(20);
    return {
      person: p,
      aliases,
      links,
      works,
      quotes,
      canEdit: ctx.role === "superadmin" || p.createdBy === ctx.userId,
    };
  });
}

export async function listCategories(database: Database, ctx: AppContext, includeArchived = false) {
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: categories.id,
        slug: categories.slug,
        nameUz: categories.nameUz,
        nameEn: categories.nameEn,
        nameRu: categories.nameRu,
        description: categories.description,
        parentId: categories.parentId,
        sortOrder: categories.sortOrder,
        deletedAt: categories.deletedAt,
        count: sql<number>`(select count(*)::int from nodinest.resource_categories rc
          join nodinest.resources r on r.id = rc.resource_id and r.deleted_at is null
          where rc.category_id = "categories"."id")`,
      })
      .from(categories)
      .where(includeArchived ? undefined : isNull(categories.deletedAt))
      .orderBy(asc(categories.sortOrder), asc(categories.nameUz)),
  );
}

export async function searchResourcesQuick(tx: Tx | Database, query: string, limit = 8) {
  const q = normalizeText(query);
  if (!q) return [];
  const like = `%${escapeLike(q)}%`;
  return tx
    .select({
      id: resources.id,
      title: resources.title,
      type: resources.type,
      publicationDate: resources.publicationDate,
    })
    .from(resources)
    .where(
      and(
        isNull(resources.deletedAt),
        or(
          ilike(sql`nodinest.nn_norm(${resources.title})`, like),
          ilike(sql`nodinest.nn_norm(coalesce(${resources.originalTitle}, ''))`, like),
        ),
      ),
    )
    .orderBy(
      sql`nodinest.nn_norm(${resources.title}) like ${escapeLike(q) + "%"} desc`,
      asc(resources.title),
    )
    .limit(limit);
}

export async function addRelation(
  tx: Tx,
  ctx: AppContext,
  fromId: string,
  toId: string,
  kind: "edition_of" | "translation_of" | "part_of" | "related",
) {
  await assertCanEdit(tx, ctx, "resource", fromId);
  if (fromId === toId) throw new AppError("VALIDATION", "self_relation");
  await tx.insert(resourceRelations).values({ fromId, toId, kind }).onConflictDoNothing();
  await audit(tx, {
    actorId: ctx.userId,
    action: "resource.relate",
    entityType: "resource",
    entityId: fromId,
    after: { toId, kind },
  });
}

/** Minimal header for sub-pages (taqriz): one query instead of the full detail. */
export async function getResourceHeader(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const [r] = await tx.execute<{
      title: string;
      type: ResourceType;
      cover_url: string | null;
      cover_file_id: string | null;
      authors: string | null;
      youtube_id: string | null;
      media_url: string | null;
    }>(sql`
      select r.title, r.type, r.cover_url, r.cover_file_id,
        (select string_agg(p.full_name, ', ' order by c.position)
           from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
          where c.resource_id = r.id) as authors,
        (select i.value from nodinest.resource_identifiers i
          where i.resource_id = r.id and i.scheme = 'youtube' limit 1) as youtube_id,
        (select l.url from nodinest.resource_links l
          where l.resource_id = r.id
            and l.url ~* '\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|webm|mov|m4v)([?#]|$)' limit 1) as media_url
      from nodinest.resources r where r.id = ${id} and r.deleted_at is null`);
    return r
      ? {
          title: r.title,
          type: r.type,
          coverUrl: r.cover_url,
          coverFileId: r.cover_file_id,
          authors: r.authors,
          youtubeId: r.youtube_id,
          mediaUrl: r.media_url,
        }
      : null;
  });
}

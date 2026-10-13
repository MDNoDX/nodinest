/**
 * Zod schemas for every write path. Used by server actions, the AI tool layer
 * and suggestion approval, so all entry points share identical rules.
 */
import { z } from "zod";
import { isValidPartialDate } from "./dates";

const trimmed = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "invalid_url");

const optUrl = z
  .union([httpUrl, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const partialDate = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidPartialDate(v), "invalid_partial_date");

const optInt = (min: number, max: number) =>
  z
    // Empty values first: z.coerce would turn "" / null into 0.
    .union([z.literal(""), z.null(), z.coerce.number().int().min(min).max(max)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : Number(v)));

export const uuid = z.string().uuid();

export const PERSON_ROLES = [
  "author",
  "scholar",
  "speaker",
  "educator",
  "researcher",
  "translator",
  "journalist",
  "scientist",
  "other",
] as const;

export const RESOURCE_TYPES = [
  "book",
  "course",
  "video",
  "lecture",
  "interview",
  "article",
  "podcast",
  "other",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export const BOOK_LIKE: ResourceType[] = ["book", "course"];
export const MEDIA_LIKE: ResourceType[] = ["video", "lecture", "interview", "podcast", "article"];

export const CONTRIBUTOR_ROLES = [
  "author",
  "editor",
  "translator",
  "speaker",
  "host",
  "guest",
  "instructor",
  "narrator",
  "illustrator",
  "other",
] as const;

const linkSchema = z.object({
  kind: z
    .enum(["source", "reference", "official", "read", "purchase", "social", "other"])
    .default("reference"),
  url: httpUrl,
  label: optText(120),
});

export const personInput = z
  .object({
    fullName: trimmed(200).min(1, "required"),
    aliases: z.array(trimmed(200).min(1)).max(20).default([]),
    shortDescription: optText(300),
    biography: optText(20_000),
    birthDate: partialDate,
    deathDate: partialDate,
    nationality: optText(120),
    roles: z.array(z.enum(PERSON_ROLES)).max(9).default([]),
    activityAreas: optText(300),
    portraitUrl: optUrl,
    portraitFileId: uuid.optional().nullable(),
    websiteUrl: optUrl,
    links: z.array(linkSchema).max(20).default([]),
    verification: z.enum(["unverified", "verified", "disputed"]).default("unverified"),
  })
  .refine((p) => !p.birthDate || !p.deathDate || p.birthDate <= p.deathDate, {
    message: "death_before_birth",
    path: ["deathDate"],
  });
export type PersonInput = z.infer<typeof personInput>;

/** A contributor is an existing person or a new name (created on save/approval). */
export const contributorInput = z
  .object({
    personId: uuid.optional().nullable(),
    newPersonName: trimmed(200).optional().nullable(),
    role: z.enum(CONTRIBUTOR_ROLES).default("author"),
  })
  .refine((c) => !!c.personId !== !!c.newPersonName, "contributor_person_or_name");

export const resourceInput = z.object({
  type: z.enum(RESOURCE_TYPES),
  title: trimmed(400).min(1, "required"),
  originalTitle: optText(400),
  description: optText(20_000),
  coverUrl: optUrl,
  coverFileId: uuid.optional().nullable(),
  language: optText(40),
  /** Edition the user read. */
  publicationDate: partialDate,
  /** Original publication / writing date. */
  originalDate: partialDate,
  sourceUrl: optUrl,
  verification: z.enum(["unverified", "verified", "disputed"]).default("unverified"),
  contributors: z.array(contributorInput).max(30).default([]),
  categoryIds: z.array(uuid).max(20).default([]),
  tags: z.array(trimmed(48).min(1)).max(20).default([]),
  identifiers: z
    .array(
      z.object({
        scheme: z.enum(["isbn13", "isbn10", "doi", "youtube", "wikidata", "openlibrary", "other"]),
        value: trimmed(200).min(1),
      }),
    )
    .max(10)
    .default([]),
  links: z.array(linkSchema).max(20).default([]),
  book: z
    .object({
      publisher: optText(200),
      pageCount: optInt(1, 100_000),
      originalLanguage: optText(40),
      readingUrl: optUrl,
    })
    .optional()
    .nullable(),
  media: z
    .object({
      platform: optText(80),
      channel: optText(200),
      durationSeconds: optInt(1, 1_000_000),
      transcript: optText(200_000),
      transcriptUrl: optUrl,
    })
    .optional()
    .nullable(),
});
export type ResourceInput = z.infer<typeof resourceInput>;

/** "abandoned" was merged into "paused" in v2 (kept only in the DB enum). */
export const LEARNING_STATUSES = ["planned", "in_progress", "completed", "paused"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

const isoDay = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** ISO timestamp or datetime-local string; "" → null. */
const optDateTime = z
  .union([z.string().trim().max(40), z.null(), z.date()])
  .optional()
  .transform((v, ctx) => {
    if (v == null || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "INVALID_DATE" });
      return z.NEVER;
    }
    return d;
  });

export const learningRecordInput = z
  .object({
    resourceId: uuid,
    status: z.enum(LEARNING_STATUSES),
    startedAt: optDateTime,
    completedAt: optDateTime,
    /** 10-point scale for every kind of resource. */
    rating: optInt(1, 10),
    review: optText(20_000),
    progressCurrent: optInt(0, 1_000_000),
    progressTotal: optInt(1, 1_000_000),
    progressUnit: z.enum(["pages", "chapters", "minutes", "percent", "lessons"]).default("pages"),
  })
  .refine((r) => !r.startedAt || !r.completedAt || r.startedAt <= r.completedAt, {
    message: "completed_before_started",
    path: ["completedAt"],
  })
  .refine(
    (r) =>
      r.progressCurrent == null || r.progressTotal == null || r.progressCurrent <= r.progressTotal,
    { message: "progress_exceeds_total", path: ["progressCurrent"] },
  );
export type LearningRecordInput = z.infer<typeof learningRecordInput>;

export const noteInput = z
  .object({
    kind: z.enum(["note", "quote"]).default("note"),
    title: optText(300),
    body: optText(50_000),
    quoteText: optText(10_000),
    resourceId: uuid.optional().nullable(),
    personId: uuid.optional().nullable(),
    pageFrom: optInt(0, 100_000),
    pageTo: optInt(0, 100_000),
    location: optText(300),
    timestampSeconds: optInt(0, 1_000_000),
    visibility: z.enum(["private", "public"]).default("private"),
    verification: z.enum(["unverified", "verified", "disputed"]).default("unverified"),
    tags: z.array(trimmed(48).min(1)).max(20).default([]),
  })
  .refine((n) => n.kind !== "quote" || !!n.quoteText, { message: "required", path: ["quoteText"] })
  .refine((n) => n.kind !== "note" || !!n.body || !!n.title, {
    message: "required",
    path: ["body"],
  })
  .refine((n) => n.pageFrom == null || n.pageTo == null || n.pageTo >= n.pageFrom, {
    message: "page_range",
    path: ["pageTo"],
  });
export type NoteInput = z.infer<typeof noteInput>;

export const goalInput = z.object({
  title: trimmed(200).min(1, "required"),
  metric: z.enum(["completed_resources", "pages"]),
  period: z.enum(["week", "month", "year"]),
  target: z.coerce.number().int().min(1).max(100_000),
  resourceType: z
    .union([z.enum(RESOURCE_TYPES), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  note: optText(2000),
});

export const planInput = z
  .object({
    title: trimmed(200).min(1, "required"),
    resourceId: uuid.optional().nullable(),
    startOn: isoDay,
    endOn: isoDay,
    note: optText(2000),
  })
  .refine((p) => !p.startOn || !p.endOn || p.startOn <= p.endOn, {
    message: "end_before_start",
    path: ["endOn"],
  });

export const collectionInput = z.object({
  name: trimmed(120).min(1, "required"),
  description: optText(1000),
  ranked: z.boolean().default(false),
});

export const conspectSectionInput = z
  .object({
    title: trimmed(300).min(1, "required"),
    content: z.string().max(200_000).default(""),
    pageFrom: optInt(0, 100_000),
    pageTo: optInt(0, 100_000),
  })
  .refine((c) => c.pageFrom == null || c.pageTo == null || c.pageTo >= c.pageFrom, {
    message: "page_range",
    path: ["pageTo"],
  });

export const categoryInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "invalid_slug"),
  nameUz: trimmed(120).min(1, "required"),
  nameEn: trimmed(120).min(1, "required"),
  description: optText(1000),
  parentId: uuid.optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const suggestionInput = z.object({
  operation: z.enum(["create", "update", "archive"]),
  targetType: z.enum(["person", "resource"]),
  targetId: uuid.optional().nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
  explanation: optText(5000),
  sourceUrls: z.array(httpUrl).max(10).default([]),
});

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

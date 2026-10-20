/**
 * NodiNest database schema (PostgreSQL, schema "nodinest").
 *
 * Layout:
 *   1. Auth tables (Better Auth): user, session, account, verification
 *   2. Shared catalog: people, resources (+ type-specific details), categories,
 *      catalog tags, contributors, identifiers, links, relations
 *   3. Personal data (private by default, RLS-protected): learning records,
 *      study sessions, notes/quotations, personal tags, collections, goals
 *   4. Collaboration & ops: suggestions, audit log, files, AI, settings,
 *      rate limits
 *
 * Search vectors, trigram indexes, RLS policies and the nn_norm() function
 * live in the hand-written SQL migration (drizzle/0001_*.sql). See
 * docs/SCHEMA.md for design notes.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const nodinest = pgSchema("nodinest");

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── Enums ──────────────────────────────────────────────────────────────────
export const userRole = nodinest.enum("user_role", ["user", "superadmin"]);
export const userStatus = nodinest.enum("user_status", ["active", "suspended"]);
export const resourceType = nodinest.enum("resource_type", [
  "book",
  "course",
  "video",
  "lecture",
  "interview",
  "article",
  "podcast",
  "other",
]);
export const verificationStatus = nodinest.enum("verification_status", [
  "unverified",
  "verified",
  "disputed",
]);
export const contributorRole = nodinest.enum("contributor_role", [
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
]);
export const identifierScheme = nodinest.enum("identifier_scheme", [
  "isbn13",
  "isbn10",
  "doi",
  "youtube",
  "wikidata",
  "openlibrary",
  "other",
]);
export const linkKind = nodinest.enum("link_kind", [
  "source",
  "reference",
  "official",
  "read",
  "purchase",
  "social",
  "other",
]);
export const relationKind = nodinest.enum("relation_kind", [
  "edition_of",
  "translation_of",
  "part_of",
  "related",
]);
export const learningStatus = nodinest.enum("learning_status", [
  "planned",
  "in_progress",
  "completed",
  "paused",
  "abandoned",
]);
export const progressUnit = nodinest.enum("progress_unit", [
  "pages",
  "chapters",
  "minutes",
  "percent",
  "lessons",
]);
export const noteKind = nodinest.enum("note_kind", ["note", "quote"]);
export const visibility = nodinest.enum("visibility", ["private", "public"]);
export const goalMetric = nodinest.enum("goal_metric", [
  "minutes",
  "sessions",
  "completed_resources",
  "pages",
]);
export const goalPeriod = nodinest.enum("goal_period", ["day", "week", "month", "year"]);
export const goalStatus = nodinest.enum("goal_status", ["active", "achieved", "archived"]);
export const suggestionOp = nodinest.enum("suggestion_op", ["create", "update", "archive"]);
export const suggestionTarget = nodinest.enum("suggestion_target", ["person", "resource"]);
export const suggestionStatus = nodinest.enum("suggestion_status", [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
]);
export const filePurpose = nodinest.enum("file_purpose", [
  "cover",
  "portrait",
  "attachment",
  /** Images / PDFs / audio sent to the AI or embedded in a taqriz. */
  "media",
]);
export const textSourceKind = nodinest.enum("text_source_kind", ["file", "url"]);
export const textSourceStatus = nodinest.enum("text_source_status", ["pending", "ready", "failed"]);
export const aiActionStatus = nodinest.enum("ai_action_status", [
  "proposed",
  "completed",
  "failed",
  "rejected",
]);
export const aiMessageRole = nodinest.enum("ai_message_role", ["user", "model"]);

// ─── 1. Auth (Better Auth) ──────────────────────────────────────────────────
export const user = nodinest.table(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Never settable from the client (Better Auth additionalFields input:false).
    role: userRole("role").notNull().default("user"),
    status: userStatus("status").notNull().default("active"),
    locale: text("locale").notNull().default("uz"),
    timezone: text("timezone").notNull().default("Asia/Tashkent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("user_email_uq").on(sql`lower(${t.email})`)],
);

export const session = nodinest.table(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = nodinest.table(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    uniqueIndex("account_provider_uq").on(t.providerId, t.accountId),
  ],
);

export const verification = nodinest.table(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ─── Files (object storage metadata) ────────────────────────────────────────
export const files = nodinest.table(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    path: text("path").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    purpose: filePurpose("purpose").notNull(),
    // Catalog files (covers/portraits) are readable by any signed-in user;
    // attachments stay owner-only.
    isCatalog: boolean("is_catalog").notNull().default(false),
    // Personal attachment linked to a resource (owner-only).
    resourceId: uuid("resource_id").references((): AnyPgColumn => resources.id, {
      onDelete: "set null",
    }),
    uploadedAt: ts("uploaded_at"),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("files_path_uq").on(t.bucket, t.path),
    index("files_owner_idx").on(t.ownerId),
    index("files_resource_idx").on(t.resourceId),
  ],
);

// ─── 2. Shared catalog ──────────────────────────────────────────────────────
/**
 * Flexible historical dates (EDTF subset). Unknown stays NULL.
 *   "1499" / "1499-05" / "1499-05-12"   exact (partial ISO)
 *   "1150~"                              approximately
 *   "1100/1200"                          somewhere in this range (also centuries)
 */
const PD = "-?[0-9]{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?";
const partialDateCheck = (col: string) =>
  sql.raw(`${col} IS NULL OR ${col} ~ '^(${PD}~?|${PD}/${PD})$'`);

export const people = nodinest.table(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    shortDescription: text("short_description"),
    biography: text("biography"),
    birthDate: text("birth_date"),
    deathDate: text("death_date"),
    nationality: text("nationality"),
    roles: text("roles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    activityAreas: text("activity_areas"),
    portraitUrl: text("portrait_url"),
    portraitFileId: uuid("portrait_file_id").references(() => files.id, { onDelete: "set null" }),
    websiteUrl: text("website_url"),
    verification: verificationStatus("verification").notNull().default("unverified"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    check("people_birth_date_chk", partialDateCheck("birth_date")),
    check("people_death_date_chk", partialDateCheck("death_date")),
    index("people_updated_idx").on(t.updatedAt),
  ],
);

export const personAliases = nodinest.table(
  "person_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (t) => [index("person_aliases_person_idx").on(t.personId)],
);

export const personLinks = nodinest.table(
  "person_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: linkKind("kind").notNull().default("reference"),
    url: text("url").notNull(),
    label: text("label"),
  },
  (t) => [index("person_links_person_idx").on(t.personId)],
);

export const resources = nodinest.table(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: resourceType("type").notNull(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    description: text("description"),
    coverUrl: text("cover_url"),
    coverFileId: uuid("cover_file_id").references(() => files.id, { onDelete: "set null" }),
    language: text("language"),
    // Edition the user read (year or date).
    publicationDate: text("publication_date"),
    // Original publication / writing date of the work.
    originalDate: text("original_date"),
    sourceUrl: text("source_url"),
    verification: verificationStatus("verification").notNull().default("unverified"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    check("resources_pubdate_chk", partialDateCheck("publication_date")),
    check("resources_origdate_chk", partialDateCheck("original_date")),
    index("resources_type_idx").on(t.type),
    index("resources_updated_idx").on(t.updatedAt),
  ],
);

/** Book / course-material specific metadata (1:1 with resources). */
/** Publishers are catalog entries like people: written once, then picked. */
export const publishers = nodinest.table(
  "publishers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    websiteUrl: text("website_url"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("publishers_updated_idx").on(t.updatedAt)],
);

export const bookDetails = nodinest.table("book_details", {
  resourceId: uuid("resource_id")
    .primaryKey()
    .references(() => resources.id, { onDelete: "cascade" }),
  publisherId: uuid("publisher_id").references(() => publishers.id, { onDelete: "set null" }),
  pageCount: integer("page_count"),
  originalLanguage: text("original_language"),
  readingUrl: text("reading_url"),
});

/** Video / lecture / interview / podcast / article metadata (1:1). */
export const mediaDetails = nodinest.table("media_details", {
  resourceId: uuid("resource_id")
    .primaryKey()
    .references(() => resources.id, { onDelete: "cascade" }),
  platform: text("platform"),
  channel: text("channel"),
  durationSeconds: integer("duration_seconds"),
  /** Courses: number of lessons. */
  lessonCount: integer("lesson_count"),
  transcript: text("transcript"),
  transcriptUrl: text("transcript_url"),
});

export const resourceContributors = nodinest.table(
  "resource_contributors",
  {
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    role: contributorRole("role").notNull().default("author"),
    position: smallint("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.personId, t.role] }),
    index("contributors_person_idx").on(t.personId),
  ],
);

export const resourceIdentifiers = nodinest.table(
  "resource_identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    scheme: identifierScheme("scheme").notNull(),
    value: text("value").notNull(),
  },
  (t) => [
    uniqueIndex("identifiers_scheme_value_uq").on(t.scheme, t.value),
    index("identifiers_resource_idx").on(t.resourceId),
  ],
);

export const resourceLinks = nodinest.table(
  "resource_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    kind: linkKind("kind").notNull().default("reference"),
    url: text("url").notNull(),
    label: text("label"),
  },
  (t) => [index("resource_links_resource_idx").on(t.resourceId)],
);

export const resourceRelations = nodinest.table(
  "resource_relations",
  {
    fromId: uuid("from_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    kind: relationKind("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromId, t.toId, t.kind] }),
    check("relations_no_self_chk", sql`${t.fromId} <> ${t.toId}`),
    index("relations_to_idx").on(t.toId),
  ],
);

/** Global, admin-managed topic taxonomy (nestable). */
export const categories = nodinest.table(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    nameUz: text("name_uz").notNull(),
    nameEn: text("name_en").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("categories_parent_idx").on(t.parentId),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "categories_parent_fk",
    }).onDelete("set null"),
  ],
);

export const resourceCategories = nodinest.table(
  "resource_categories",
  {
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.categoryId] }),
    index("resource_categories_cat_idx").on(t.categoryId),
  ],
);

/**
 * Tags. owner_id NULL = shared catalog tag (attached to resources);
 * owner_id set = a user's private tag (attached to that user's notes).
 */
export const tags = nodinest.table(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalized: text("normalized").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("tags_owner_norm_uq").on(t.ownerId, t.normalized).nullsNotDistinct()],
);

export const resourceTags = nodinest.table(
  "resource_tags",
  {
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.tagId] }),
    index("resource_tags_tag_idx").on(t.tagId),
  ],
);

// ─── 3. Personal data (RLS: user_id = app.user_id) ──────────────────────────
export const learningRecords = nodinest.table(
  "learning_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    status: learningStatus("status").notNull().default("planned"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    /** year | month | day | time (NULL = time); see lib/reading-date. */
    startedPrecision: text("started_precision"),
    completedPrecision: text("completed_precision"),
    rating: smallint("rating"),
    review: text("review"),
    progressCurrent: integer("progress_current"),
    progressTotal: integer("progress_total"),
    progressUnit: progressUnit("progress_unit").notNull().default("pages"),
    lastAccessedAt: ts("last_accessed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("learning_records_user_resource_uq").on(t.userId, t.resourceId),
    index("learning_records_user_status_idx").on(t.userId, t.status),
    check(
      "learning_records_precision_chk",
      sql`coalesce(${t.startedPrecision}, 'time') IN ('year','month','day','time') AND coalesce(${t.completedPrecision}, 'time') IN ('year','month','day','time')`,
    ),
    check("learning_records_rating_chk", sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 10`),
    check(
      "learning_records_progress_chk",
      sql`(${t.progressCurrent} IS NULL OR ${t.progressCurrent} >= 0) AND (${t.progressTotal} IS NULL OR ${t.progressTotal} > 0)`,
    ),
  ],
);

export const notes = nodinest.table(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: noteKind("kind").notNull().default("note"),
    title: text("title"),
    // For notes: the note body. For quotes: the user's own commentary.
    body: text("body"),
    // Exact quotation text (quotes only) — never mixed with commentary.
    quoteText: text("quote_text"),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
    // Person the quotation is attributed to; only set explicitly by the user.
    personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
    pageFrom: integer("page_from"),
    pageTo: integer("page_to"),
    location: text("location"),
    timestampSeconds: integer("timestamp_seconds"),
    visibility: visibility("visibility").notNull().default("private"),
    verification: verificationStatus("verification").notNull().default("unverified"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("notes_user_created_idx").on(t.userId, t.createdAt),
    index("notes_resource_idx").on(t.resourceId),
    check(
      "notes_quote_text_chk",
      sql`${t.kind} <> 'quote' OR (${t.quoteText} IS NOT NULL AND length(btrim(${t.quoteText})) > 0)`,
    ),
    check(
      "notes_pages_chk",
      sql`${t.pageTo} IS NULL OR ${t.pageFrom} IS NULL OR ${t.pageTo} >= ${t.pageFrom}`,
    ),
  ],
);

export const noteTags = nodinest.table(
  "note_tags",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] }), index("note_tags_tag_idx").on(t.tagId)],
);

export const collections = nodinest.table(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Seeded default collections carry a key; name NULL = translated default.
    systemKey: text("system_key"),
    name: text("name"),
    description: text("description"),
    // Ranked collections ("Top 10") show items in `position` order as #1, #2…
    ranked: boolean("ranked").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("collections_user_idx").on(t.userId),
    uniqueIndex("collections_user_system_uq").on(t.userId, t.systemKey),
    check("collections_name_chk", sql`${t.name} IS NOT NULL OR ${t.systemKey} IS NOT NULL`),
  ],
);

export const collectionItems = nodinest.table(
  "collection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: createdAt(),
  },
  (t) => [
    check("collection_items_one_target_chk", sql`num_nonnulls(${t.resourceId}, ${t.noteId}) = 1`),
    uniqueIndex("collection_items_resource_uq").on(t.collectionId, t.resourceId),
    uniqueIndex("collection_items_note_uq").on(t.collectionId, t.noteId),
  ],
);

export const goals = nodinest.table(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    metric: goalMetric("metric").notNull(),
    period: goalPeriod("period").notNull(),
    target: integer("target").notNull(),
    resourceType: resourceType("resource_type"),
    status: goalStatus("status").notNull().default("active"),
    note: text("note"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId), check("goals_target_chk", sql`${t.target} > 0`)],
);

/** Plans: scheduled learning activities. */
export const plans = nodinest.table(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
    startOn: date("start_on"),
    endOn: date("end_on"),
    done: boolean("done").notNull().default(false),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("plans_user_date_idx").on(t.userId, t.startOn)],
);

/**
 * Taqriz: the user's free-form write-up of a resource — one document per
 * (user, resource). Headings ("boblar") are optional and form the outline.
 * `doc` is a ProseMirror/Tiptap JSON tree (validated server-side);
 * `plain` is its text (search, AI, word count).
 */
export const writeups = nodinest.table(
  "writeups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    doc: jsonb("doc").notNull(),
    plain: text("plain").notNull().default(""),
    words: integer("words").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("writeups_user_resource_uq").on(t.userId, t.resourceId)],
);

/**
 * Study cards (question → answer) for memorising, scheduled by spaced
 * repetition (SM-2 style: ease, interval, due date). Made by the AI from the
 * user's material or by hand; private to the owner (RLS).
 */
export const studyCards = nodinest.table(
  "study_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
    deck: text("deck").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    explanation: text("explanation"),
    /** Where the answer is found: "p. 12", "12:30", "taqriz", a quote… */
    source: text("source"),
    /** recall | understanding | application | quote */
    kind: text("kind").notNull().default("recall"),
    ease: real("ease").notNull().default(2.5),
    intervalDays: real("interval_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    dueAt: ts("due_at").notNull().defaultNow(),
    lastReviewedAt: ts("last_reviewed_at"),
    suspended: boolean("suspended").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("study_cards_user_due_idx").on(t.userId, t.dueAt),
    index("study_cards_user_deck_idx").on(t.userId, t.deck),
  ],
);

/**
 * Where the user stopped, per resource: the second of its video / audio and the
 * place in the taqriz (position + a text anchor that survives edits). Synced
 * to the account, so another device or a new sign-in continues from there.
 */
export const resumePoints = nodinest.table(
  "resume_points",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    /** DockSource of what was playing (validated). */
    media: jsonb("media"),
    mediaSeconds: integer("media_seconds"),
    docPos: integer("doc_pos"),
    docAnchor: text("doc_anchor"),
    /** Which page was open last: "taqriz" | "resource". */
    place: text("place").notNull().default("taqriz"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.resourceId] }),
    index("resume_points_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

/**
 * A full transcript / konspekt of a resource's video or audio, made by the AI
 * segment by segment (resumable). `brief` is the AI's study of the whole
 * recording (topic, speakers, spelling of names and terms, outline) that every
 * segment is written with. Private to its owner (RLS).
 */
export const transcripts = nodinest.table(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    /** { kind: "youtube", id } | { kind: "file", fileId } */
    source: jsonb("source").notNull(),
    mode: text("mode").notNull(),
    deep: boolean("deep").notNull().default(true),
    durationSeconds: integer("duration_seconds").notNull(),
    brief: jsonb("brief"),
    /** [{ from, to, text }] in order. */
    segments: jsonb("segments").notNull().default([]),
    /** Final text (Markdown) once every segment is written. */
    text: text("text"),
    status: text("status").notNull().default("running"),
    error: text("error"),
    geminiFile: text("gemini_file"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("transcripts_user_resource_idx").on(t.userId, t.resourceId),
    check("transcripts_mode_chk", sql`${t.mode} IN ('transcript', 'notes')`),
    check("transcripts_status_chk", sql`${t.status} IN ('running', 'done', 'error')`),
  ],
);

/** Where the full text of a resource comes from (the user's PDF or a reading link). */
export const bookTextSources = nodinest.table(
  "book_text_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    kind: textSourceKind("kind").notNull(),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),
    url: text("url"),
    status: textSourceStatus("status").notNull().default("pending"),
    pages: integer("pages"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("book_text_sources_user_resource_idx").on(t.userId, t.resourceId)],
);

/** Extracted text, one row per page (searchable; private to the owner). */
export const bookPages = nodinest.table(
  "book_pages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => bookTextSources.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    content: text("content").notNull(),
  },
  (t) => [
    index("book_pages_source_page_idx").on(t.sourceId, t.page),
    index("book_pages_user_resource_idx").on(t.userId, t.resourceId),
  ],
);

// ─── 4. Collaboration, audit, AI, ops ───────────────────────────────────────
export const suggestions = nodinest.table(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    operation: suggestionOp("operation").notNull(),
    targetType: suggestionTarget("target_type").notNull(),
    targetId: uuid("target_id"),
    payload: jsonb("payload").notNull().default({}),
    baseSnapshot: jsonb("base_snapshot"),
    explanation: text("explanation"),
    sourceUrls: text("source_urls")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: suggestionStatus("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewerId: uuid("reviewer_id").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    appliedTargetId: uuid("applied_target_id"),
    origin: text("origin").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("suggestions_status_idx").on(t.status, t.createdAt),
    index("suggestions_user_idx").on(t.userId),
    check("suggestions_target_chk", sql`${t.operation} = 'create' OR ${t.targetId} IS NOT NULL`),
  ],
);

export const auditLogs = nodinest.table(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const aiConversations = nodinest.table(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId, t.updatedAt)],
);

export const aiMessages = nodinest.table(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: aiMessageRole("role").notNull(),
    content: text("content").notNull(),
    // Structured trace of tool calls made while producing this message.
    toolTrace: jsonb("tool_trace"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const aiActions = nodinest.table(
  "ai_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => aiConversations.id, {
      onDelete: "cascade",
    }),
    tool: text("tool").notNull(),
    args: jsonb("args").notNull(),
    status: aiActionStatus("status").notNull().default("proposed"),
    result: jsonb("result"),
    error: text("error"),
    createdAt: createdAt(),
    decidedAt: ts("decided_at"),
  },
  (t) => [index("ai_actions_user_idx").on(t.userId, t.createdAt)],
);

/** Cache for non-sensitive, shareable results (e.g. public URL metadata). */
export const aiCache = nodinest.table("ai_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
});

export const appSettings = nodinest.table("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

/** Fixed-window counters for per-user rate limiting (no Redis needed). */
export const rateLimits = nodinest.table(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export type User = typeof user.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type LearningRecord = typeof learningRecords.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Suggestion = typeof suggestions.$inferSelect;
export type Category = typeof categories.$inferSelect;

/**
 * Mac app sign-in hand-off: after Google sign-in in the system browser sheet,
 * a one-time code (stored hashed, 2 min) carries the session into the app.
 * Server-only (no policy for the app role).
 */
export const appHandoffs = nodinest.table("app_handoffs", {
  codeHash: text("code_hash").primaryKey(),
  sessionCookie: text("session_cookie").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

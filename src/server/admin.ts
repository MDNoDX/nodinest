/**
 * Superadmin-only operations. Every function re-checks the role and writes an
 * audit entry. Role/status changes use the privileged connection because the
 * RLS app role cannot update those columns by design.
 */
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database } from "@/db/client";
import { auditLogs, categories, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { categoryInput, zodFieldErrors } from "@/lib/validation";
import { audit } from "./audit";

function assertSuperadmin(ctx: AppContext) {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
}

export async function listUsers(database: Database, ctx: AppContext) {
  assertSuperadmin(ctx);
  return database
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      notes: sql<number>`(select count(*)::int from nodinest.notes n where n.user_id = ${user.id} and n.deleted_at is null)`,
      sessions: sql<number>`(select count(*)::int from nodinest.study_sessions s where s.user_id = ${user.id} and s.deleted_at is null)`,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(500);
}

export async function setUserRole(
  database: Database,
  ctx: AppContext,
  targetId: string,
  role: "user" | "superadmin",
) {
  assertSuperadmin(ctx);
  if (targetId === ctx.userId && role !== "superadmin") {
    // Never allow removing the last superadmin.
    const [{ n }] = await database
      .select({ n: count() })
      .from(user)
      .where(and(eq(user.role, "superadmin"), ne(user.id, ctx.userId)));
    if (Number(n) === 0) throw new AppError("CONFLICT", "last_superadmin");
  }
  await database.transaction(async (tx) => {
    const [before] = await tx.select({ role: user.role }).from(user).where(eq(user.id, targetId));
    if (!before) throw new AppError("NOT_FOUND");
    await tx.update(user).set({ role }).where(eq(user.id, targetId));
    await audit(tx, {
      actorId: ctx.userId,
      action: "user.set_role",
      entityType: "user",
      entityId: targetId,
      before,
      after: { role },
    });
  });
}

export async function setUserStatus(
  database: Database,
  ctx: AppContext,
  targetId: string,
  status: "active" | "suspended",
) {
  assertSuperadmin(ctx);
  if (targetId === ctx.userId) throw new AppError("CONFLICT", "self_suspend");
  await database.transaction(async (tx) => {
    const [before] = await tx
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, targetId));
    if (!before) throw new AppError("NOT_FOUND");
    await tx.update(user).set({ status }).where(eq(user.id, targetId));
    if (status === "suspended")
      await tx.execute(sql`delete from nodinest.session where user_id = ${targetId}`);
    await audit(tx, {
      actorId: ctx.userId,
      action: "user.set_status",
      entityType: "user",
      entityId: targetId,
      before,
      after: { status },
    });
  });
}

export async function listAudit(
  database: Database,
  ctx: AppContext,
  opts: { page?: number; entityType?: string | null },
) {
  assertSuperadmin(ctx);
  const page = Math.max(1, opts.page ?? 1);
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        before: auditLogs.before,
        after: auditLogs.after,
        meta: auditLogs.meta,
        createdAt: auditLogs.createdAt,
        actorName: user.name,
        actorEmail: user.email,
      })
      .from(auditLogs)
      .leftJoin(user, eq(user.id, auditLogs.actorId))
      .where(opts.entityType ? eq(auditLogs.entityType, opts.entityType) : undefined)
      .orderBy(desc(auditLogs.id))
      .limit(50)
      .offset((page - 1) * 50),
  );
}

export async function saveCategory(database: Database, ctx: AppContext, raw: unknown, id?: string) {
  assertSuperadmin(ctx);
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_category", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  const d = parsed.data;
  if (id && d.parentId === id)
    throw new AppError("VALIDATION", "self_parent", { fieldErrors: { parentId: ["self_parent"] } });
  return withUser(database, ctx, async (tx) => {
    if (id && d.parentId) {
      // Prevent cycles: the new parent must not be a descendant of id.
      const rows = await tx.execute<{ id: string }>(sql`
        with recursive sub as (select id from nodinest.categories where id = ${id}
          union all select c.id from nodinest.categories c join sub on c.parent_id = sub.id)
        select id from sub where id = ${d.parentId}`);
      if (rows.length)
        throw new AppError("VALIDATION", "category_cycle", {
          fieldErrors: { parentId: ["category_cycle"] },
        });
    }
    if (id) {
      const [before] = await tx.select().from(categories).where(eq(categories.id, id));
      if (!before) throw new AppError("NOT_FOUND");
      await tx.update(categories).set(d).where(eq(categories.id, id));
      await audit(tx, {
        actorId: ctx.userId,
        action: "category.update",
        entityType: "category",
        entityId: id,
        before,
        after: d,
      });
      return id;
    }
    const [row] = await tx.insert(categories).values(d).returning({ id: categories.id });
    await audit(tx, {
      actorId: ctx.userId,
      action: "category.create",
      entityType: "category",
      entityId: row.id,
      after: d,
    });
    return row.id;
  });
}

export async function archiveCategory(
  database: Database,
  ctx: AppContext,
  id: string,
  archived: boolean,
) {
  assertSuperadmin(ctx);
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(categories)
      .set({ deletedAt: archived ? new Date() : null })
      .where(eq(categories.id, id))
      .returning({ id: categories.id });
    if (!res.length) throw new AppError("NOT_FOUND");
    await audit(tx, {
      actorId: ctx.userId,
      action: archived ? "category.archive" : "category.restore",
      entityType: "category",
      entityId: id,
    });
  });
}

export async function systemOverview(database: Database, ctx: AppContext) {
  assertSuperadmin(ctx);
  const [r] = await database.execute<Record<string, number>>(sql`
    select
      (select count(*)::int from nodinest."user") as users,
      (select count(*)::int from nodinest.people where deleted_at is null) as people,
      (select count(*)::int from nodinest.resources where deleted_at is null) as resources,
      (select count(*)::int from nodinest.notes where deleted_at is null) as notes,
      (select count(*)::int from nodinest.study_sessions where deleted_at is null) as sessions,
      (select count(*)::int from nodinest.suggestions where status = 'pending') as pending_suggestions,
      (select coalesce(sum(size_bytes), 0)::bigint from nodinest.files where deleted_at is null) as storage_bytes,
      (select coalesce(sum(count), 0)::int from nodinest.rate_limits where key like 'ai:%' and window_start >= date_trunc('day', now())) as ai_requests_today,
      pg_database_size(current_database())::bigint as db_bytes`);
  return r;
}

/**
 * Messages from users to the admin: a title, the text and how to reach them.
 * Users see only their own (RLS); the superadmin reads and marks them.
 */
import "server-only";
import { later } from "./later";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { feedback, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { postFeedback } from "./monitor/events";
import { enforceRateLimit } from "./rate-limit";

export const feedbackInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  contact: z.string().trim().max(200).nullish(),
});

export async function sendFeedback(ctx: AppContext, raw: unknown) {
  const a = feedbackInput.parse(raw);
  await enforceRateLimit(db, `feedback:${ctx.userId}`, 10, 86_400);
  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .insert(feedback)
      .values({
        userId: ctx.userId,
        title: a.title,
        body: a.body,
        contact: a.contact || null,
      })
      .returning({ id: feedback.id }),
  );
  // To the admin's Telegram channel (answer there by replying to the post).
  later(() => postFeedback(row.id));
}

export async function listMyFeedback(ctx: AppContext) {
  return withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(feedback)
      .where(eq(feedback.userId, ctx.userId))
      .orderBy(desc(feedback.createdAt))
      .limit(50),
  );
}

/** Admin inbox (the superadmin account). */
export async function listAllFeedback(ctx: AppContext, status?: string | null) {
  if (ctx.role !== "superadmin" && !ctx.superadminAccount) throw new AppError("FORBIDDEN");
  return db
    .select({
      id: feedback.id,
      title: feedback.title,
      body: feedback.body,
      contact: feedback.contact,
      status: feedback.status,
      createdAt: feedback.createdAt,
      source: feedback.source,
      reply: feedback.reply,
      name: user.name,
      email: user.email,
    })
    .from(feedback)
    .leftJoin(user, eq(user.id, feedback.userId))
    .where(status ? eq(feedback.status, status) : undefined)
    .orderBy(desc(feedback.createdAt))
    .limit(200);
}

export async function setFeedbackStatus(
  ctx: AppContext,
  id: string,
  status: "new" | "read" | "done",
) {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
  await db
    .update(feedback)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(feedback.id, z.string().uuid().parse(id))));
}

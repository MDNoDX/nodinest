/**
 * "Boshlash yo'li": the first steps a new user takes, each checked from their
 * real data (so the list ticks itself off as they go).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";

export type StartSteps = {
  added: boolean;
  pdf: boolean;
  reading: boolean;
  marked: boolean;
  questions: boolean;
};

export async function getStartSteps(ctx: AppContext): Promise<StartSteps> {
  const [r] = await withUser(db, ctx, (tx) =>
    tx.execute<{
      added: boolean;
      pdf: boolean;
      reading: boolean;
      marked: boolean;
      questions: boolean;
    }>(sql`
      select
        exists(select 1 from nodinest.learning_records where user_id = ${ctx.userId}) as added,
        exists(select 1 from nodinest.book_text_sources where user_id = ${ctx.userId} and status = 'ready') as pdf,
        exists(select 1 from nodinest.learning_records where user_id = ${ctx.userId}
          and (status <> 'planned' or coalesce(progress_current, 0) > 0)) as reading,
        exists(select 1 from nodinest.notes where user_id = ${ctx.userId} and deleted_at is null) as marked,
        exists(select 1 from nodinest.study_cards where user_id = ${ctx.userId}) as questions`),
  );
  return {
    added: !!r?.added,
    pdf: !!r?.pdf,
    reading: !!r?.reading,
    marked: !!r?.marked,
    questions: !!r?.questions,
  };
}

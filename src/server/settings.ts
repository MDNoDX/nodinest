/**
 * Admin-editable application settings (stored in app_settings).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { appSettings } from "@/db/schema";

/** Permission groups the admin can enable for the AI assistant. */
export const AI_TOOL_NAMES = [
  "read_library",
  "read_web",
  "write_personal",
  "write_catalog",
  "delete",
] as const;
export type AiToolName = (typeof AI_TOOL_NAMES)[number];

export const aiSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  dailyLimitPerUser: z.coerce.number().int().min(0).max(1000).default(15),
  allowedTools: z.array(z.enum(AI_TOOL_NAMES)).default([...AI_TOOL_NAMES]),
  /** When set and in the future, AI calls are skipped (quota exhausted). */
  pausedUntil: z.string().datetime().nullable().default(null),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export async function getAiSettings(database: Database): Promise<AiSettings> {
  const [row] = await database.select().from(appSettings).where(eq(appSettings.key, "ai"));
  const envLimit = Number(process.env.AI_DAILY_LIMIT_PER_USER);
  const base = aiSettingsSchema.parse({
    dailyLimitPerUser: Number.isFinite(envLimit) && envLimit >= 0 ? envLimit : 15,
  });
  if (!row) return base;
  const parsed = aiSettingsSchema.safeParse({ ...base, ...(row.value as object) });
  return parsed.success ? parsed.data : base;
}

export async function saveAiSettings(
  database: Database,
  value: AiSettings,
  actorId: string | null,
): Promise<void> {
  await database
    .insert(appSettings)
    .values({ key: "ai", value, updatedBy: actorId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: actorId } });
}

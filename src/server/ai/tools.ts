/**
 * NodiNest AI tool registry ("Jarvis"). The ONLY operations the model can
 * trigger. Every tool:
 *   - declares a JSON schema for Gemini,
 *   - re-validates its arguments with zod on the server,
 *   - runs through the normal services with the user's own permissions
 *     (RLS + catalog edit rules), so the AI can never do more than the user.
 * Modes:
 *   read    → executed immediately, returns data
 *   act     → executed immediately (the user's own data, or catalog entries
 *             they may edit; others become suggestions); logged in ai_actions
 *   confirm → destructive (remove/delete/archive): stored as a proposal and
 *             run only after the user presses Confirm (see actions.ts)
 * No SQL, shell or arbitrary code is exposed.
 */
import "server-only";
import type { z } from "zod";
import type { AppContext } from "@/db";
import { CATALOG_TOOLS } from "./tools/catalog";
import { DESTRUCTIVE_TOOLS } from "./tools/destructive";
import { PERSONAL_TOOLS } from "./tools/personal";
import type { ToolDef, ToolEnv } from "./tools/helpers";
import { READ_TOOLS } from "./tools/read";

export type { ToolEnv } from "./tools/helpers";

export const TOOLS = {
  ...READ_TOOLS,
  ...CATALOG_TOOLS,
  ...PERSONAL_TOOLS,
  ...DESTRUCTIVE_TOOLS,
} as const;

export type ToolName = keyof typeof TOOLS;

export function isToolName(n: string): n is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOLS, n);
}

export function toolDef(n: ToolName) {
  return TOOLS[n] as unknown as ToolDef<z.ZodTypeAny>;
}

/** Validates arguments, then runs the tool with the user's permissions. */
export async function runTool(name: ToolName, rawArgs: unknown, ctx: AppContext, env: ToolEnv) {
  const t = toolDef(name);
  return t.run(ctx, t.args.parse(rawArgs ?? {}), env);
}

export function parseToolArgs(name: ToolName, rawArgs: unknown) {
  return toolDef(name).args.parse(rawArgs ?? {});
}

export function toolsForGemini(allowed: ToolName[]) {
  return allowed.map((name) => ({
    name,
    description: TOOLS[name].description,
    parametersJsonSchema: TOOLS[name].parameters,
  }));
}

/**
 * Mac app sign-in. Google refuses sign-in inside embedded web views, so the
 * app opens /app-login in Apple's secure sign-in sheet (ASWebAuthenticationSession).
 * After a normal Google sign-in there, /app-login stores the session cookie
 * under a one-time code (hashed, 2 minutes) and returns nodinest://auth?code=…;
 * the app then opens /api/app/handoff?code=… in its own web view, which sets
 * the same session cookie. Codes are single-use.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { appHandoffs } from "@/db/schema";

const TTL_MS = 2 * 60 * 1000;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

export const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

export async function createHandoff(sessionCookie: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db.delete(appHandoffs).where(lt(appHandoffs.expiresAt, new Date()));
  await db.insert(appHandoffs).values({
    codeHash: hash(code),
    sessionCookie,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return code;
}

/** Returns the session cookie once; the code is deleted in the same step. */
export async function redeemHandoff(code: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(code)) return null;
  const [row] = await db
    .delete(appHandoffs)
    .where(eq(appHandoffs.codeHash, hash(code)))
    .returning();
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row.sessionCookie;
}

import "server-only";
import { after } from "next/server";

/**
 * Runs `fn` after the response (Next's after()); outside a request (scripts,
 * tests, the bot's own jobs) it simply starts it. Errors are swallowed.
 */
export function later(fn: () => Promise<unknown>) {
  const run = () => fn().catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
}

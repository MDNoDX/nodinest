/**
 * Server errors → the admin's Telegram channel, with the full stack trace.
 * The same error (by fingerprint) is posted at most once per 10 minutes per
 * instance and the whole site sends at most 40 error reports an hour, so a
 * broken page cannot flood the channel. Counts are kept for the daily summary.
 */
import "server-only";
import { createHash } from "node:crypto";
import { envLine, esc, redact, tgConfigured, tgDocument, tgSend } from "./telegram";

export type ErrorInfo = {
  /** Where: "render /library/[id]", "action", "api /api/…", "console", "client". */
  where?: string;
  method?: string;
  path?: string;
  userId?: string;
  extra?: string;
};

const seen = new Map<string, number>();
let hourStart = 0;
let hourCount = 0;
/** Errors since the instance started, by fingerprint (read by the daily summary). */
export const errorCounts = new Map<string, { n: number; title: string }>();

const enabled = () =>
  tgConfigured() &&
  (process.env.VERCEL_ENV === "production" || process.env.NN_REPORT_ERRORS === "1");

function describe(err: unknown) {
  if (err instanceof Error) {
    const cause =
      err.cause instanceof Error ? `\nCaused by: ${err.cause.stack ?? err.cause.message}` : "";
    return {
      title: `${err.name}: ${err.message}`,
      stack: `${err.stack ?? `${err.name}: ${err.message}`}${cause}`,
      digest: (err as { digest?: string }).digest,
    };
  }
  const s = typeof err === "string" ? err : JSON.stringify(err);
  return { title: s.slice(0, 300), stack: s, digest: undefined };
}

/** First lines of the stack that point into our code (for the fingerprint). */
function fingerprint(title: string, stack: string) {
  const frames = stack
    .split("\n")
    .filter((l) => /src\/|app\/|server\//.test(l))
    .slice(0, 3)
    .join("|");
  const msg = title.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id").replace(/\d+/g, "N");
  return createHash("sha1").update(`${msg}|${frames}`).digest("hex").slice(0, 12);
}

export async function reportError(err: unknown, info: ErrorInfo = {}) {
  try {
    const d = describe(err);
    const title = redact(d.title).slice(0, 300);
    const stack = redact(d.stack);
    const fp = fingerprint(title, stack);
    const c = errorCounts.get(fp) ?? { n: 0, title };
    c.n++;
    errorCounts.set(fp, c);
    if (!enabled()) return;

    const now = Date.now();
    if ((seen.get(fp) ?? 0) > now - 10 * 60_000) return;
    if (now - hourStart > 3_600_000) {
      hourStart = now;
      hourCount = 0;
    }
    if (++hourCount > 40) return;
    seen.set(fp, now);

    const head = [
      `🔴 <b>${esc(title)}</b>`,
      info.where && `📍 ${esc(info.where)}`,
      info.path && `🔗 <code>${esc(info.method ?? "")} ${esc(info.path.split("?")[0])}</code>`,
      info.userId && `👤 <code>${esc(info.userId)}</code>`,
      d.digest && `#️⃣ digest <code>${esc(d.digest)}</code>`,
      c.n > 1 && `🔁 ${c.n}-marta (bu server nusxasida)`,
      info.extra && esc(redact(info.extra)).slice(0, 500),
      `<i>${esc(envLine())} · #err_${fp}</i>`,
    ]
      .filter(Boolean)
      .join("\n");
    const body = `${head}\n\n<pre>${esc(stack.slice(0, 2800))}</pre>`;
    if (stack.length <= 2800) await tgSend(body);
    else await tgDocument(`error-${fp}.txt`, `${title}\n\n${stack}`, head);
  } catch {
    /* reporting must never throw */
  }
}

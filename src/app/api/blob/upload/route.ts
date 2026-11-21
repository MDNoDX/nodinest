import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, toCtx } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { PART_BYTES, finishParts, putPart } from "@/server/blob-store";
import { authorizeUpload } from "@/server/storage";
import { apiError } from "../../_utils";

/**
 * Uploads in parts (Netlify takes ≤ 6 MB per request):
 *  POST {pathname, purpose, size, mime} → auth + type/size/path/quota checks →
 *       { pathname (with a random suffix), ticket, partBytes }
 *  PUT  ?ticket=…&i=<index>[&last=1]  body = the part's bytes
 *       The last part writes the manifest after checking the total size.
 * The ticket is signed (HMAC) and lasts an hour; it names the user, the path,
 * the size and the type, so a part can only go where the checks allowed.
 */

const startSchema = z.object({
  pathname: z.string().min(1).max(400),
  purpose: z.enum(["cover", "portrait", "attachment", "media"]),
  size: z.number().int().positive(),
  mime: z.string().max(100),
});

type Ticket = { u: string; p: string; s: number; m: string; e: number };

const secret = () => process.env.BETTER_AUTH_SECRET || "dev-upload-secret";
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

function makeTicket(t: Ticket) {
  const body = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readTicket(raw: string | null): Ticket | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString()) as Ticket;
    return t.e > Date.now() ? t : null;
  } catch {
    return null;
  }
}

/** The reason (e.g. "file_too_large") goes along, so the form can say what was wrong. */
function fail(err: unknown) {
  const res = apiError(err);
  if (err instanceof AppError) res.headers.set("x-nn-reason", err.message);
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser();
    if (!u) throw new AppError("UNAUTHENTICATED");
    const input = startSchema.parse(await req.json());
    await authorizeUpload(toCtx(u), input.pathname, input);
    // A random suffix before the extension: two uploads never share a path.
    const dot = input.pathname.lastIndexOf(".");
    // `t<time>-<random>`: the daily sweep knows how old an unfinished upload is.
    const tag = `t${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
    const pathname =
      dot > input.pathname.lastIndexOf("/")
        ? `${input.pathname.slice(0, dot)}-${tag}${input.pathname.slice(dot)}`
        : `${input.pathname}-${tag}`;
    const ticket = makeTicket({
      u: u.id,
      p: pathname,
      s: input.size,
      m: input.mime,
      e: Date.now() + 3600_000,
    });
    return NextResponse.json({ pathname, ticket, partBytes: PART_BYTES });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const u = await getCurrentUser();
    if (!u) throw new AppError("UNAUTHENTICATED");
    const q = req.nextUrl.searchParams;
    const t = readTicket(q.get("ticket"));
    if (!t || t.u !== u.id) throw new AppError("FORBIDDEN");
    const i = Number(q.get("i"));
    const count = Math.max(1, Math.ceil(t.s / PART_BYTES));
    if (!Number.isInteger(i) || i < 0 || i >= count) throw new AppError("VALIDATION", "bad_part");
    const bytes = new Uint8Array(await req.arrayBuffer());
    const want = i < count - 1 ? PART_BYTES : t.s - PART_BYTES * (count - 1);
    if (bytes.byteLength !== want) throw new AppError("VALIDATION", "upload_mismatch");
    await putPart(t.p, i, bytes);
    if (q.get("last") === "1") {
      const m = await finishParts(t.p, t.m);
      if (!m || m.size !== t.s || m.parts.length !== count)
        throw new AppError("VALIDATION", "upload_missing");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

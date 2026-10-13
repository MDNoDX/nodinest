/**
 * SSRF-hardened server-side fetch for importing public web pages.
 *  - http(s) only, ports 80/443, no credentials, no internal hostnames
 *  - every DNS answer must be a public unicast IP; the check happens inside
 *    the socket `lookup`, so the validated IP is the one connected to
 *    (prevents DNS-rebinding TOCTOU)
 *  - redirects followed manually (max 3), each hop re-validated
 *  - response size capped, total timeout enforced, content-type allowlist
 * Fetched content is untrusted data — never instructions.
 */
import "server-only";
import dns from "node:dns";
import { Agent, fetch } from "undici";
import { AppError } from "@/lib/errors";
import { checkPublicUrl, isPublicIp } from "./ip";

export const USER_AGENT =
  "NodiNestBot/1.0 (+https://github.com/MDNoDX/nodibook; personal knowledge library)";

const ALLOWED_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "application/json"];

type LookupCb = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

function safeLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicIp(a.address))) {
      const e = new Error("blocked_private_address") as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return cb(e, "");
    }
    if (options && (options as { all?: boolean }).all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

let agent: Agent | null = null;
function getAgent() {
  agent ??= new Agent({
    connect: { lookup: safeLookup as never, timeout: 5000 },
    headersTimeout: 8000,
    bodyTimeout: 8000,
    maxRedirections: 0,
  } as ConstructorParameters<typeof Agent>[0]);
  return agent;
}

export type FetchedPage = {
  url: string;
  status: number;
  contentType: string;
  body: string;
  /** Raw bytes (only when `binary: true`). */
  bytes?: Uint8Array;
  truncated: boolean;
};

export async function safeFetch(
  rawUrl: string,
  opts: {
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    accept?: string;
    /** Extra allowed content types (e.g. application/pdf). */
    allowTypes?: string[];
    /** Return raw bytes; oversized bodies fail instead of truncating. */
    binary?: boolean;
  } = {},
): Promise<FetchedPage> {
  const maxBytes = opts.maxBytes ?? 1_500_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const check = checkPublicUrl(current);
      if (!check.ok) throw new AppError("URL_BLOCKED", check.reason);
      let res;
      try {
        res = await fetch(check.url, {
          dispatcher: getAgent(),
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent": USER_AGENT,
            accept:
              opts.accept ??
              "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8",
            "accept-language": "uz,en;q=0.8",
          },
        });
      } catch (err) {
        const msg = String((err as { cause?: { code?: string } })?.cause?.code ?? "");
        if (msg === "EBLOCKED") throw new AppError("URL_BLOCKED", "private_ip");
        throw new AppError("FETCH_FAILED", controller.signal.aborted ? "timeout" : "network");
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel();
        if (!loc) throw new AppError("FETCH_FAILED", "bad_redirect");
        current = new URL(loc, check.url).toString();
        continue;
      }
      const contentType = (res.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (![...ALLOWED_TYPES, ...(opts.allowTypes ?? [])].includes(contentType)) {
        await res.body?.cancel();
        throw new AppError("FETCH_FAILED", "unsupported_content_type");
      }
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > maxBytes * 4) {
        await res.body?.cancel();
        throw new AppError("FETCH_FAILED", "too_large");
      }
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      let truncated = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          if (opts.binary) {
            await reader.cancel();
            throw new AppError("FETCH_FAILED", "too_large");
          }
          chunks.push(value.subarray(0, value.byteLength - (size - maxBytes)));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      const raw = Buffer.concat(chunks);
      if (opts.binary)
        return {
          url: check.url.toString(),
          status: res.status,
          contentType,
          body: "",
          bytes: new Uint8Array(raw),
          truncated,
        };
      const body = new TextDecoder("utf-8", { fatal: false }).decode(raw);
      return { url: check.url.toString(), status: res.status, contentType, body, truncated };
    }
    throw new AppError("FETCH_FAILED", "too_many_redirects");
  } finally {
    clearTimeout(timer);
  }
}

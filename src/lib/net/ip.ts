import ipaddr from "ipaddr.js";

/**
 * True only for globally routable unicast addresses. Rejects loopback,
 * private (RFC1918), link-local, CGNAT, multicast, reserved, unique-local,
 * IPv4-mapped private addresses, etc.
 */
export function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let addr = ipaddr.parse(address);
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  if (addr.range() !== "unicast") return false;
  if (addr.kind() === "ipv4") {
    // Extra guards not covered by ipaddr ranges.
    const [a, b] = (addr as ipaddr.IPv4).octets;
    if (a === 0 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  }
  return true;
}

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".intranet",
];

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Static URL validation (before DNS). */
export function checkPublicUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, reason: "protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "port" };
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s)))
    return { ok: false, reason: "host" };
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) return { ok: false, reason: "private_ip" };
  } else if (!host.includes(".")) {
    return { ok: false, reason: "host" };
  }
  if (raw.length > 2048) return { ok: false, reason: "too_long" };
  return { ok: true, url };
}

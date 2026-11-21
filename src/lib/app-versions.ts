/**
 * The installed apps people download: assets of the GitHub release
 * `RELEASE_TAG` of the public repo (free, any size; /api/download/[platform]
 * redirects there). Upload a new build with
 *   gh release upload apps <file> --repo MDNoDX/nodinest --clobber
 * then bump the version and the file together; the Mac app asks
 * /api/app/version and offers the update itself.
 */
export const RELEASE_BASE = "https://github.com/MDNoDX/nodinest/releases/download/apps";
export const APPS = {
  mac: { version: "1.5", file: "Roznoma-1.5.dmg" },
  windows: { version: "1.0.0", file: "Roznoma-Setup-1.0.0.exe" },
  android: { version: "1.0", file: "Roznoma-1.0.apk" },
} as const;
export type AppPlatform = keyof typeof APPS;

/** "1.10" > "1.9": compares dotted versions part by part. */
export function newerVersion(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** The Mac app's own version from its user agent ("NodiNestMac/1.3"), else null. */
export function macAppVersion(ua: string): string | null {
  return /NodiNestMac\/([\d.]+)/.exec(ua)?.[1] ?? null;
}

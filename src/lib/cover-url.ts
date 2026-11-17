/**
 * Sharper cover pictures. Our own files come in several widths
 * (/api/files/[id]?w=160|320|480|720), so the browser can pick the one the
 * screen needs (a Retina screen takes the bigger copy). Pictures from other
 * sites are asked for in their large size when the site has one.
 */
const OURS = /^\/api\/files\/([0-9a-f-]{36})\?w=\d+/;
const WIDTHS = [320, 480, 720] as const;
/** Bump when the small copies change (quality), so browsers fetch them again. */
export const COVER_V = "2";

export function coverSrcSet(src: string): string | undefined {
  const m = OURS.exec(src);
  if (!m) return undefined;
  return WIDTHS.map((w) => `/api/files/${m[1]}?w=${w}&v=${COVER_V} ${w}w`).join(", ");
}

/** The large picture of a known cover host; anything else unchanged. */
export function sharperCover(url: string): string {
  return (
    url
      // Open Library: S / M → L.
      .replace(/(covers\.openlibrary\.org\/b\/[^/]+\/[^-]+)-[SM]\.jpg/i, "$1-L.jpg")
      // YouTube thumbnails: the small ones → 480×360 (always there).
      .replace(/(i\.ytimg\.com\/vi\/[\w-]+\/)(default|mqdefault)\.jpg/, "$1hqdefault.jpg")
      // Amazon: drop the size token (._SX300_, ._SY180_, ._AC_UL320_ …).
      .replace(/(m\.media-amazon\.com\/images\/I\/[\w+-]+)\._[^/]*?_\.(jpg|png)$/i, "$1.$2")
  );
}

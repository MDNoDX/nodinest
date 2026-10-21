/** YouTube video id (11 chars) from a watch / short / embed URL or a bare id. */
export function youtubeIdFromUrl(raw: string): string | null {
  const v = raw.trim();
  if (/^[\w-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be")
      return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (host === "youtube.com" || host === "music.youtube.com") {
      const id = u.searchParams.get("v");
      if (id && /^[\w-]{11}$/.test(id)) return id;
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
      return m ? m[2] : null;
    }
  } catch {
    /* invalid */
  }
  return null;
}

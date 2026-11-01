"use client";
/**
 * Finds how long a video / audio is, in the browser (no server, so YouTube
 * cannot block it): a hidden YouTube player tells its duration over
 * postMessage; a direct audio / video file is read for its metadata.
 */

const YT = "https://www.youtube-nocookie.com";

export function youtubeDuration(id: string, timeoutMs = 15_000): Promise<number | null> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.src = `${YT}/embed/${encodeURIComponent(id)}?enablejsapi=1&mute=1&origin=${encodeURIComponent(location.origin)}`;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      left: "-10px",
      top: "-10px",
      opacity: "0",
      pointerEvents: "none",
    });
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      clearInterval(ping);
      clearTimeout(timer);
      frame.remove();
      resolve(v && v > 0 ? Math.round(v) : null);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT || e.source !== frame.contentWindow) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const dur = d?.info?.duration;
        if (typeof dur === "number" && dur > 0) finish(dur);
      } catch {
        /* not ours */
      }
    };
    window.addEventListener("message", onMsg);
    const ping = setInterval(
      () =>
        frame.contentWindow?.postMessage(
          JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
          YT,
        ),
      400,
    );
    const timer = setTimeout(() => finish(null), timeoutMs);
    document.body.appendChild(frame);
  });
}

const MEDIA_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|mp4|m4v|webm|mov|mkv)(\?|#|$)/i;
export const isMediaFileUrl = (url: string) => MEDIA_RE.test(url) || url.startsWith("/api/files/");

/** A direct audio / video file (also our own /api/files/…): its metadata. */
export function fileDuration(url: string, timeoutMs = 15_000): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(/\.(mp4|m4v|webm|mov|mkv)/i.test(url) ? "video" : "audio");
    el.preload = "metadata";
    el.muted = true;
    const timer = setTimeout(() => finish(null), timeoutMs);
    const finish = (v: number | null) => {
      clearTimeout(timer);
      el.removeAttribute("src");
      el.load();
      resolve(v && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
    };
    el.onloadedmetadata = () => finish(el.duration);
    el.onerror = () => finish(null);
    el.src = url;
  });
}

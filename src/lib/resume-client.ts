"use client";

/** Saves "where I stopped" to the account; survives the page closing (keepalive). */
export function postResume(data: {
  resourceId: string;
  place?: "taqriz" | "resource";
  media?: { source: unknown; seconds: number };
  doc?: { pos: number; anchor: string };
}) {
  try {
    void fetch("/api/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* offline: the next save will catch up */
  }
}

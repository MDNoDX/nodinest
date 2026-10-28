"use client";
import { Analytics } from "@vercel/analytics/next";

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Anonymous, cookieless page counts (Vercel Web Analytics); ids and queries are dropped. */
export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(e) => {
        const u = new URL(e.url);
        return { ...e, url: `${u.origin}${u.pathname.replace(ID, ":id")}` };
      }}
    />
  );
}

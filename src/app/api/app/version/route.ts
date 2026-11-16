import { NextResponse } from "next/server";
import { APPS } from "@/lib/app-versions";

/** The newest installed-app versions (the Mac app checks it for updates). */
export function GET() {
  return NextResponse.json(
    Object.fromEntries(
      Object.entries(APPS).map(([k, v]) => [k, { version: v.version, url: `/api/download/${k}` }]),
    ),
    { headers: { "cache-control": "public, max-age=300" } },
  );
}

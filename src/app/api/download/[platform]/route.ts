import { issueSignedToken, presignUrl } from "@vercel/blob";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { hitRateLimit } from "@/server/rate-limit";

/**
 * The installed apps, kept in the (private) file store under downloads/:
 * /api/download/mac → the DMG, /api/download/windows → the installer,
 * /api/download/android → the signed APK. Each
 * answer is a link signed for ten minutes, so the file comes straight from
 * the store (big files never pass through a function).
 */
const DOWNLOADS = {
  mac: "downloads/Roznoma-1.1.dmg",
  windows: "downloads/Roznoma-Setup-1.0.0.exe",
  android: "downloads/Roznoma-1.0.apk",
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const pathname = DOWNLOADS[platform as keyof typeof DOWNLOADS];
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!pathname || !token) return new NextResponse(null, { status: 404 });
  // A few downloads an hour per address: the files are big and the transfer is paid.
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!(await hitRateLimit(db, `download:${ip}`, 12, 3600)).allowed)
    return new NextResponse("Too many downloads, try again in an hour.", { status: 429 });
  const signed = await issueSignedToken({
    token,
    pathname,
    operations: ["get"],
    validUntil: Date.now() + 10 * 60_000,
  });
  const { presignedUrl } = await presignUrl(signed, {
    operation: "get",
    pathname,
    access: "private",
  });
  return NextResponse.redirect(presignedUrl, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}

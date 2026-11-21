import { NextResponse, type NextRequest } from "next/server";
import { APPS, RELEASE_BASE } from "@/lib/app-versions";

/**
 * The installed apps: /api/download/mac → the DMG, /api/download/windows → the
 * installer, /api/download/android → the signed APK. Each answer redirects to
 * the file in our public GitHub release, so big files never pass through a
 * function and the transfer costs nothing.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const file = APPS[platform as keyof typeof APPS]?.file;
  if (!file) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(`${RELEASE_BASE}/${file}`, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}

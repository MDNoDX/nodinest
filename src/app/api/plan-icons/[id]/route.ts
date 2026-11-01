import { NextResponse, type NextRequest } from "next/server";
import { getCustomIcons } from "@/server/custom-icons";

/** One added icon. An image only: it can run nothing, whatever was stored. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const icon = (await getCustomIcons()).find((i) => i.id === id);
  if (!icon) return new NextResponse(null, { status: 404 });
  return new NextResponse(icon.svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

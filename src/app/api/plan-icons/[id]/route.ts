import { NextResponse, type NextRequest } from "next/server";
import { iconImage } from "@/server/plan-icons";

/**
 * One picture the owner gave a plan icon. Every picture has its own id (a new
 * one when it changes), so browsers keep it for a year. An image only: it can
 * run nothing, whatever was stored.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await iconImage(id);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(img.body), {
    headers: {
      "content-type": img.type,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

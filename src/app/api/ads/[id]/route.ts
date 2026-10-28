import { NextResponse, type NextRequest } from "next/server";
import { countClick, getAds } from "@/server/ads";

/** An ad's link: counts the click, then goes to the advertiser (only to its saved URL). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = (await getAds()).items.find((a) => a.id === id && a.active);
  if (!ad) return new NextResponse(null, { status: 404 });
  await countClick(ad.id).catch(() => {});
  return NextResponse.redirect(ad.url, 302);
}

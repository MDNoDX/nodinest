import { NextResponse, type NextRequest } from "next/server";
import { iconSvg, searchIcons } from "@/server/plan-icons";
import { apiError, apiUser } from "../../_utils";

/** ?q=… finds icons; ?icon=prefix:name shows one. Owner only. */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = await apiUser();
    const icon = req.nextUrl.searchParams.get("icon");
    if (icon)
      return new NextResponse(await iconSvg(ctx, icon), {
        headers: {
          "content-type": "image/svg+xml",
          "cache-control": "private, max-age=86400",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      });
    return NextResponse.json({
      icons: await searchIcons(ctx, req.nextUrl.searchParams.get("q") ?? ""),
    });
  } catch (err) {
    return apiError(err);
  }
}

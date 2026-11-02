import { threadList, unreadChats } from "@/server/dm";
import { apiError, apiUser, json } from "../../_utils";

/** The chat list and the unread badge, asked for while a page is open. */
export async function GET(req: Request) {
  try {
    const { ctx } = await apiUser();
    const onlyCount = new URL(req.url).searchParams.has("count");
    const unread = await unreadChats(ctx);
    return json(onlyCount ? { unread } : { unread, threads: await threadList(ctx) });
  } catch (err) {
    return apiError(err);
  }
}

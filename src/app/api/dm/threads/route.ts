import { threadList, touchSeen, unreadChats } from "@/server/dm";
import { unreadCount } from "@/server/notifications";
import { apiError, apiUser, json } from "../../_utils";

/** The chat list and the unread badge, asked for while a page is open. */
export async function GET(req: Request) {
  try {
    const { ctx } = await apiUser();
    const onlyCount = new URL(req.url).searchParams.has("count");
    // Asked every 30 s from every open page (one request for every badge):
    // unread chats, the bell, and "I am here".
    const [unread, bell] = await Promise.all([
      unreadChats(ctx),
      onlyCount ? unreadCount(ctx) : Promise.resolve(undefined),
      touchSeen(ctx),
    ]);
    return json(onlyCount ? { unread, bell } : { unread, threads: await threadList(ctx) });
  } catch (err) {
    return apiError(err);
  }
}

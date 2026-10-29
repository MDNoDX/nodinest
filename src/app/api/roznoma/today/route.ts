import { getDay } from "@/server/roznoma";
import { dayKey } from "@/lib/dates";
import { apiError, apiUser, json } from "../../_utils";

/** Today's list (for the alarms that ring while the site is open). */
export async function GET() {
  try {
    const { user, ctx } = await apiUser();
    const d = await getDay(ctx, dayKey(new Date(), user.timezone), user.locale);
    return json({
      day: d.day,
      tz: user.timezone,
      items: d.items.map((i) => ({
        id: i.id,
        title: i.title,
        amount: i.amount,
        time: i.time,
        alarm: i.alarm,
        done: i.done,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

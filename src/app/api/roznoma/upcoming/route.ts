import { dayKey } from "@/lib/dates";
import { getDay } from "@/server/roznoma";
import { apiError, apiUser, json } from "../../_utils";

const DAYS = 7;

/** The week's alarms, for the installed app to hand to the phone. */
export async function GET() {
  try {
    const { user, ctx } = await apiUser();
    const days = Array.from({ length: DAYS }, (_, i) =>
      dayKey(new Date(Date.now() + i * 86_400_000), user.timezone),
    );
    const list = await Promise.all(days.map((d) => getDay(ctx, d)));
    return json({
      alarms: list.flatMap((d) =>
        d.items
          .filter((i) => i.alarm && i.time && !i.done)
          .map((i) => ({
            id: i.id,
            title: i.title,
            body: i.amount ?? "",
            at: `${d.day}T${i.time}:00`,
          })),
      ),
    });
  } catch (err) {
    return apiError(err);
  }
}

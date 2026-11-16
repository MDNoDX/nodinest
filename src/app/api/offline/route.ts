import { offlineManifest } from "@/server/offline";
import { apiError, apiUser, json } from "../_utils";

export const runtime = "nodejs";

/** What this device keeps for use without the internet (components/pwa/offline-sync.tsx). */
export async function GET() {
  try {
    const { user, ctx } = await apiUser();
    return json(await offlineManifest(ctx, user.username ?? null));
  } catch (err) {
    return apiError(err);
  }
}

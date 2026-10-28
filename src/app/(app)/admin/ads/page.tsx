import { AdsAdmin } from "@/components/admin/ads-admin";
import { pageContext } from "@/lib/page";
import { clickCounts, getAds } from "@/server/ads";

export async function generateMetadata() {
  return { title: "Ads" };
}

export default async function AdminAds() {
  await pageContext({ admin: true });
  const [s, clicks] = await Promise.all([getAds(), clickCounts()]);
  return <AdsAdmin initial={s} clicks={clicks} />;
}

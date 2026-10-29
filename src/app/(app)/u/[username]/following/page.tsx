import { getTranslations } from "next-intl/server";
import { FollowPage } from "../follow-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const t = await getTranslations("social");
  return { title: `@${(await params).username} · ${t("followingListTitle")}` };
}

export default function Page({ params }: { params: Promise<{ username: string }> }) {
  return <FollowPage params={params} which="following" />;
}

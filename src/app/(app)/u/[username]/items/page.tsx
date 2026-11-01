import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AllItems } from "@/components/social/all-items";
import { ItemsVisibility } from "@/components/social/items-visibility";
import { pageContext } from "@/lib/page";
import { myItemsVisibility, profileByUsername, publicItems } from "@/server/social";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("social"))("library") };
}

/** Everything a person shows; on my own page, the switches for each item. */
export default async function ProfileItemsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const { ctx, user } = await pageContext();
  const t = await getTranslations("social");
  const p = await profileByUsername(ctx, decodeURIComponent(username));
  if (!p || !p.visible) notFound();
  const [items, mine] = await Promise.all([
    p.self ? Promise.resolve([]) : publicItems(ctx, p.id, 500),
    p.self ? myItemsVisibility(ctx) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Link
        href={`/u/${p.username}`}
        className="text-muted hover:text-foreground inline-flex items-center gap-1.5 self-start text-sm"
      >
        <ArrowLeft className="size-4" /> {p.name}
      </Link>
      {p.self ? (
        <ItemsVisibility items={[...mine]} profilePublic={user.profilePublic} />
      ) : (
        <>
          <h1 className="text-xl font-bold tracking-tight">{t("library")}</h1>
          <AllItems items={[...items]} />
        </>
      )}
    </div>
  );
}

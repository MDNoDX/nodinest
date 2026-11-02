import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";
import { pageContext, sp, type SP } from "@/lib/page";
import { openThread } from "@/server/dm";

export const dynamic = "force-dynamic";

/** /chats/new?u=username: the conversation with that person (started when allowed). */
export default async function NewChat({ searchParams }: { searchParams: SP }) {
  const u = sp((await searchParams).u);
  if (!u) notFound();
  const { ctx } = await pageContext();
  let id: string | null = null;
  try {
    id = await openThread(ctx, u);
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "FORBIDDEN") notFound();
  }
  if (id) redirect(`/chats/${id}`);
  const t = await getTranslations("chat");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="bg-surface-2 text-muted grid size-14 place-items-center rounded-2xl">
        <Lock className="size-6" />
      </span>
      <p className="max-w-sm text-sm">{t("closed")}</p>
      <Link href={`/u/${u}`} className="text-primary text-sm font-semibold hover:underline">
        {t("profile")}
      </Link>
    </div>
  );
}

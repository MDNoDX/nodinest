import { MessageCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("chat"))("title") };
}

/** Wide screens: the right side before a conversation is chosen. */
export default async function ChatsPage() {
  const t = await getTranslations("chat");
  return (
    <div className="text-muted hidden h-full flex-col items-center justify-center gap-3 p-8 text-center lg:flex">
      <span className="bg-surface-2 grid size-16 place-items-center rounded-2xl">
        <MessageCircle className="size-8" />
      </span>
      <p className="max-w-xs text-sm">{t("pick")}</p>
    </div>
  );
}

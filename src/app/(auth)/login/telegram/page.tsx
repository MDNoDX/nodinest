import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TelegramReturn } from "@/components/auth/telegram-login";
import { authProviders } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("withTelegram") };
}

/** Where oauth.telegram.org sends the user back (the signed data is in the URL hash). */
export default function TelegramLoginPage() {
  if (!authProviders.telegramBotId) notFound();
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <TelegramReturn />
    </main>
  );
}

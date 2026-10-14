import { CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RetryButton } from "./retry";

export const dynamic = "force-static";

export async function generateMetadata() {
  return { title: (await getTranslations("offline"))("title") };
}

/** Shown by the service worker for pages that were never opened on this device. */
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <span className="bg-primary-soft text-primary mx-auto grid size-14 place-items-center rounded-2xl">
          <CloudOff className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted mt-2 text-sm leading-relaxed">{t("body")}</p>
        <RetryButton label={t("retry")} />
      </div>
    </main>
  );
}

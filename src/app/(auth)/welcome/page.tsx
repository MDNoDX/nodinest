import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogoSymbol } from "@/components/brand/logo";
import { LanguagePicker } from "@/components/profile/language-picker";
import { WelcomeForm } from "@/components/profile/welcome-form";
import { requireUser } from "@/lib/auth/session";
import { suggestUsername } from "@/server/profile";
import { isStorageConfigured } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getTranslations("welcome"))("title") };
}

/** First sign-in: language, picture, name and a username — one short screen. */
export default async function WelcomePage() {
  const user = await requireUser();
  if (user.username) redirect("/");
  const t = await getTranslations("welcome");
  const first = user.firstName ?? user.name.split(/\s+/)[0] ?? "";
  const last = user.lastName ?? (user.name.split(/\s+/).slice(1).join(" ") || "");
  const username = await suggestUsername(first, last, user.email);
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoSymbol className="size-14" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted mt-2">{t("subtitle")}</p>
        </div>
        <section className="card flex flex-col gap-6 p-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold">{t("language")}</h2>
            <LanguagePicker />
          </div>
          <div className="border-border border-t pt-6">
            <WelcomeForm
              userId={user.id}
              storage={isStorageConfigured()}
              initial={{ firstName: first, lastName: last, username, image: user.image }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

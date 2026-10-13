import { BookOpen, ListTree, Sparkles, Trophy } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LoginPanel } from "@/components/auth/login-panel";
import { LogoSymbol } from "@/components/brand/logo";
import { IconChip } from "@/components/ui/misc";
import { authProviders } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signIn") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations();
  const features = [
    ["library", <BookOpen key="l" />, "indigo"],
    ["konspekt", <ListTree key="k" />, "teal"],
    ["stats", <Trophy key="s" />, "amber"],
    ["assistant", <Sparkles key="a" />, "rose"],
  ] as const;
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50rem 28rem at 15% -10%, color-mix(in oklab, var(--c-blue) 28%, transparent), transparent 70%), radial-gradient(45rem 26rem at 95% 110%, color-mix(in oklab, var(--c-violet) 24%, transparent), transparent 70%)",
        }}
      />
      <div className="relative grid w-full max-w-4xl items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <section className="hidden md:block">
          <LogoSymbol className="size-14" />
          <h1 className="mt-5 text-4xl font-bold tracking-tight">{t("auth.signInTitle")}</h1>
          <p className="text-muted mt-2 text-lg">{t("brand.tagline")}</p>
          <ul className="mt-8 flex flex-col gap-4">
            {features.map(([k, icon, hue]) => (
              <li key={k} className="flex items-center gap-3">
                <IconChip icon={icon} hue={hue} className="size-10 rounded-xl [&_svg]:size-5" />
                <span className="text-[15px]">{t(`auth.features.${k}`)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="w-full">
          <div className="mb-8 flex flex-col items-center text-center md:hidden">
            <LogoSymbol className="size-16" />
            <h1 className="mt-4 text-3xl font-bold tracking-tight">{t("auth.signInTitle")}</h1>
            <p className="text-muted mt-2 text-sm">{t("brand.tagline")}</p>
          </div>
          <LoginPanel googleEnabled={authProviders.google} devEnabled={authProviders.devLogin} />
          <p className="text-muted mt-6 text-center text-xs">{t("auth.privacyNote")}</p>
        </section>
      </div>
    </main>
  );
}

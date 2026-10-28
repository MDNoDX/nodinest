import { BookOpen, ListTree, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
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

/** Only same-site paths are allowed as a return address (no open redirects). */
function safeNext(v: string | string[] | undefined): string {
  const n = Array.isArray(v) ? v[0] : v;
  // No explicit target: continue where the user stopped last time (/resume).
  return n && /^\/(?![/\\])/.test(n) ? n.slice(0, 200) : "/resume";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  const t = await getTranslations();
  const features = [
    ["library", <BookOpen key="l" />, "indigo"],
    ["taqriz", <ListTree key="k" />, "teal"],
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
          <LoginPanel
            googleEnabled={authProviders.google}
            telegramBotId={authProviders.telegramBotId}
            devEnabled={authProviders.devLogin}
            next={next}
          />
          <p className="text-muted mt-6 text-center text-xs">{t("auth.privacyNote")}</p>
          <p className="text-muted mt-2 text-center text-xs">
            {t.rich("auth.agree", {
              terms: (c) => (
                <Link href="/terms" className="hover:text-foreground underline">
                  {c}
                </Link>
              ),
              privacy: (c) => (
                <Link href="/privacy" className="hover:text-foreground underline">
                  {c}
                </Link>
              ),
            })}
          </p>
        </section>
      </div>
    </main>
  );
}

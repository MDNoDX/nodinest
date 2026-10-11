import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LoginPanel } from "@/components/auth/login-panel";
import { LogoSymbol } from "@/components/brand/logo";
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
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,var(--primary-soft),transparent)]"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoSymbol className="size-16" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t("auth.signInTitle")}</h1>
          <p className="text-muted mt-2 text-sm">{t("brand.tagline")}</p>
        </div>
        <LoginPanel googleEnabled={authProviders.google} devEnabled={authProviders.devLogin} />
        <p className="text-muted mt-6 text-center text-xs">{t("auth.privacyNote")}</p>
      </div>
    </main>
  );
}

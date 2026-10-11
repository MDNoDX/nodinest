import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogoSymbol } from "@/components/brand/logo";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <LogoSymbol className="mx-auto size-14 opacity-80" />
        <h1 className="mt-4 text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="text-muted mt-2 text-sm">{t("notFoundBody")}</p>
        <Link
          href="/"
          className="bg-primary text-primary-foreground mt-6 inline-block rounded-lg px-4 py-2 text-sm font-medium"
        >
          {t("goHome")}
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LogoSymbol } from "@/components/brand/logo";
import { LEGAL_UPDATED, legalDoc } from "@/content/legal";

/** A public legal page (privacy / terms), readable without signing in. */
export async function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const locale = await getLocale();
  const t = await getTranslations("legal");
  const d = legalDoc(kind, locale);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold">
        <LogoSymbol className="size-8" /> NodiNote
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">{d.title}</h1>
      <p className="text-muted mt-1 text-sm">{t("updated", { date: LEGAL_UPDATED })}</p>
      <p className="mt-6 leading-relaxed">{d.intro}</p>
      {d.sections.map((s) => (
        <section key={s.h} className="mt-8">
          <h2 className="text-lg font-semibold">{s.h}</h2>
          {s.p.map((p) => (
            <p key={p.slice(0, 40)} className="text-foreground/85 mt-2 leading-relaxed">
              {p}
            </p>
          ))}
        </section>
      ))}
      <nav className="border-border text-muted mt-12 flex gap-4 border-t pt-6 text-sm">
        <Link href="/privacy" className="hover:text-foreground">
          {t("privacyTitle")}
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          {t("termsTitle")}
        </Link>
        <Link href="/login" className="hover:text-foreground ml-auto">
          {t("back")}
        </Link>
      </nav>
    </main>
  );
}

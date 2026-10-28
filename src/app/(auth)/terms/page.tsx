import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/legal/legal-page";
import { legalDoc } from "@/content/legal";

export async function generateMetadata() {
  return { title: legalDoc("terms", await getLocale()).title };
}

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}

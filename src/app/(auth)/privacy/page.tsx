import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/legal/legal-page";
import { legalDoc } from "@/content/legal";

export async function generateMetadata() {
  return { title: legalDoc("privacy", await getLocale()).title };
}

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}

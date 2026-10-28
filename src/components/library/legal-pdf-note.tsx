import { Scale } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** Under every book-PDF upload: only legal copies, personal use, no sharing. */
export function LegalPdfNote() {
  const t = useTranslations("resource");
  return (
    <p className="text-muted flex items-start gap-1.5 text-xs leading-snug">
      <Scale className="mt-px size-3.5 shrink-0" />
      <span>
        {t("legalPdf")}{" "}
        <Link href="/terms" className="hover:text-foreground underline">
          {t("legalPdfMore")}
        </Link>
      </span>
    </p>
  );
}

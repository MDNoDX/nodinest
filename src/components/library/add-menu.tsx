import { Brain } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * The resource page's "Make questions" (quotes and notes are added from
 * "My notes and quotes" below, so they are not repeated up here). Icon only on phones.
 */
export function AddMenu({ resourceId }: { resourceId: string }) {
  const t = useTranslations("resource");
  return (
    <Button asChild variant="outline" title={t("makeQuestions")}>
      <Link href={`/review?resource=${resourceId}`}>
        <Brain className="text-[var(--c-teal)]" />
        <span className="max-sm:sr-only">{t("makeQuestions")}</span>
      </Link>
    </Button>
  );
}

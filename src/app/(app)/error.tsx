"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="grid min-h-[50dvh] place-items-center text-center">
      <div>
        <h1 className="text-2xl font-semibold">{t("errors.pageTitle")}</h1>
        <p className="text-muted mt-2 text-sm">{t("errors.pageBody")}</p>
        <Button className="mt-6" onClick={reset}>
          {t("common.tryAgain")}
        </Button>
      </div>
    </div>
  );
}

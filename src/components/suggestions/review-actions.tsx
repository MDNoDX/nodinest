"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { reviewSuggestionAction, withdrawSuggestionAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";

export function ReviewActions({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [dupe, setDupe] = useState(false);
  const { pending, exec } = useAction();
  const run = (decision: "approve" | "reject", allowDuplicate = false) =>
    exec(() => reviewSuggestionAction(id, decision, note || null, allowDuplicate), {
      success: decision === "approve" ? t("suggestions.approved") : t("suggestions.rejectedMsg"),
      onSuccess: () => router.push("/suggestions?scope=review"),
      onError: (r) => {
        if (r.code === "DUPLICATE") {
          setDupe(true);
          return false;
        }
      },
    });
  return (
    <div className="card flex flex-col gap-3 p-5">
      <Field label={t("suggestions.reviewNote")} optional>
        {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button loading={pending} onClick={() => run("approve")}>
          {t("suggestions.approve")}
        </Button>
        {dupe && (
          <Button variant="outline" loading={pending} onClick={() => run("approve", true)}>
            {t("suggestions.approveAnyway")}
          </Button>
        )}
        <Button variant="danger" disabled={pending} onClick={() => run("reject")}>
          {t("suggestions.reject")}
        </Button>
      </div>
    </div>
  );
}

export function WithdrawButton({ id }: { id: string }) {
  const t = useTranslations("suggestions");
  const { pending, exec } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => exec(() => withdrawSuggestionAction(id), { success: t("withdrawn") })}
    >
      {t("withdraw")}
    </Button>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { deleteGoalAction, setGoalStatusAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";

export function GoalActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  return (
    <div className="flex gap-1">
      {status === "active" ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() => exec(() => setGoalStatusAction(id, "achieved"))}
          >
            {t("plans.achieved")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => exec(() => setGoalStatusAction(id, "archived"))}
          >
            {t("plans.archive")}
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => exec(() => setGoalStatusAction(id, "active"))}
        >
          {t("plans.reactivate")}
        </Button>
      )}
      <ConfirmButton
        size="sm"
        variant="ghost"
        message={t("common.delete")}
        onConfirm={() => exec(() => deleteGoalAction(id))}
      >
        {t("common.delete")}
      </ConfirmButton>
    </div>
  );
}

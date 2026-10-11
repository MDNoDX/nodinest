"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteConversationAction } from "@/app/actions/ai";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";

export function DeleteConversation({ id }: { id: string }) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const { exec } = useAction();
  return (
    <ConfirmButton
      variant="ghost"
      size="icon-sm"
      aria-label={t("deleteChat")}
      message={t("deleteChat")}
      onConfirm={() =>
        exec(() => deleteConversationAction(id), { onSuccess: () => router.push("/assistant") })
      }
    >
      <Trash2 />
    </ConfirmButton>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { setUserRoleAction, setUserStatusAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";

export function UserActions({
  id,
  role,
  status,
  self,
}: {
  id: string;
  role: string;
  status: string;
  self: boolean;
}) {
  const t = useTranslations("admin");
  const { pending, exec } = useAction();
  return (
    <div className="flex flex-wrap gap-1">
      <ConfirmButton
        size="sm"
        variant="ghost"
        danger={role === "superadmin"}
        message={role === "superadmin" ? t("makeUser") : t("makeAdmin")}
        onConfirm={() =>
          exec(() => setUserRoleAction(id, role === "superadmin" ? "user" : "superadmin"), {
            success: t("roleChanged"),
          })
        }
      >
        {role === "superadmin" ? t("makeUser") : t("makeAdmin")}
      </ConfirmButton>
      {!self && (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() =>
            exec(() => setUserStatusAction(id, status === "active" ? "suspended" : "active"), {
              success: t("statusChanged"),
            })
          }
        >
          {status === "active" ? t("suspend") : t("activate")}
        </Button>
      )}
    </div>
  );
}

"use client";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setAdminPermsAction, setUserStatusAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { ADMIN_PERMS, type AdminPerm } from "@/lib/admin-perms";
import { useAction } from "@/lib/use-action";

/**
 * Per-user admin actions. The superadmin chooses which parts of the admin an
 * account gets; an admin with the "users" part may only suspend regular users.
 * The superadmin account itself can never be changed here.
 */
export function UserActions({
  id,
  role,
  perms,
  status,
  self,
  superadmin,
}: {
  id: string;
  role: string;
  perms: string[];
  status: string;
  self: boolean;
  /** The viewer is the superadmin (in admin mode). */
  superadmin: boolean;
}) {
  const t = useTranslations("admin");
  const { pending, exec } = useAction();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<AdminPerm[]>(ADMIN_PERMS.filter((p) => perms.includes(p)));
  if (role === "superadmin" || self) return null;
  const canSuspend = superadmin || perms.length === 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {superadmin && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ShieldCheck /> {t("permsTitle")}
          </Button>
        )}
        {canSuspend && (
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
      {open && (
        <div className="bg-surface-2 flex flex-col gap-2 rounded-lg p-3">
          {ADMIN_PERMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(p)}
                onChange={(e) =>
                  setChosen((c) => (e.target.checked ? [...c, p] : c.filter((x) => x !== p)))
                }
              />
              {t(`perms.${p}`)}
            </label>
          ))}
          <Button
            size="sm"
            loading={pending}
            className="self-start"
            onClick={() =>
              exec(() => setAdminPermsAction(id, chosen), {
                success: t("permsSaved"),
                onSuccess: () => setOpen(false),
              })
            }
          >
            {t("permsSave")}
          </Button>
        </div>
      )}
    </div>
  );
}

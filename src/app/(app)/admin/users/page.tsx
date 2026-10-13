import { getTranslations } from "next-intl/server";
import { UserActions } from "@/components/admin/user-actions";
import { Badge, Card } from "@/components/ui/misc";
import { fmtDate } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { listUsers } from "@/server/admin";

export default async function AdminUsers() {
  const { ctx, db, user, locale, tz } = await pageContext({ admin: true });
  const t = await getTranslations();
  const users = await listUsers(db, ctx);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-border text-muted border-b text-xs">
          <tr>
            <th className="px-4 py-2 font-medium">{t("settings.name")}</th>
            <th className="px-4 py-2 font-medium">{t("settings.role")}</th>
            <th className="px-4 py-2 font-medium">{t("common.status")}</th>
            <th className="px-4 py-2 font-medium">{t("admin.activity")}</th>
            <th className="px-4 py-2 font-medium">{t("admin.joined")}</th>
            <th className="px-4 py-2 font-medium">{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-2">
                <div className="font-medium">{u.name}</div>
                <div className="text-muted text-xs">{u.email}</div>
              </td>
              <td className="px-4 py-2">
                <Badge tone={u.role === "superadmin" ? "accent" : "neutral"}>
                  {t(`settings.roles.${u.role}`)}
                </Badge>
              </td>
              <td className="px-4 py-2">
                <Badge tone={u.status === "active" ? "success" : "danger"}>
                  {t(`admin.userStatus.${u.status}`)}
                </Badge>
              </td>
              <td className="text-muted px-4 py-2 text-xs tabular-nums">
                {u.records} · {u.notes}
              </td>
              <td className="text-muted px-4 py-2 text-xs">{fmtDate(u.createdAt, locale, tz)}</td>
              <td className="px-4 py-2">
                <UserActions id={u.id} role={u.role} status={u.status} self={u.id === user.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

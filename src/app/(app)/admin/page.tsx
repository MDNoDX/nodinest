import { getTranslations } from "next-intl/server";
import { Card, StatTile } from "@/components/ui/misc";
import { fmtBytes } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { systemOverview } from "@/server/admin";
import { aiAvailability } from "@/server/ai/assistant";
import { isStorageConfigured } from "@/server/storage";

export default async function AdminOverview() {
  const { ctx, db } = await pageContext({ admin: true });
  const t = await getTranslations();
  const [o, ai] = await Promise.all([systemOverview(db, ctx), aiAvailability()]);
  const keys = [
    "users",
    "people",
    "resources",
    "notes",
    "records",
    "pending_suggestions",
    "ai_requests_today",
    "storage_bytes",
    "db_bytes",
  ] as const;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {keys.map((k) => (
          <StatTile
            key={k}
            label={t(`admin.counts.${k}`)}
            value={k.endsWith("bytes") ? fmtBytes(Number(o[k])) : Number(o[k])}
          />
        ))}
      </div>
      <Card className="p-5 text-sm">
        <h2 className="mb-2 font-semibold">{t("admin.limitsTitle")}</h2>
        <p className="text-muted">{t("admin.limitsBody")}</p>
        <ul className="mt-3 flex flex-col gap-1">
          <li>Gemini: {ai.available ? "✓" : `— (${ai.reason})`}</li>
          <li>Storage: {isStorageConfigured() ? "✓" : "—"}</li>
          <li>Google OAuth: {process.env.GOOGLE_CLIENT_ID ? "✓" : "—"}</li>
        </ul>
      </Card>
    </div>
  );
}

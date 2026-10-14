import { AppWindow, Lock } from "lucide-react";
import { InstallApp } from "@/components/pwa/install-app";
import { getTranslations } from "next-intl/server";
import { ProfileForm, AppearanceForm } from "@/components/settings/settings-forms";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ProgressBar } from "@/components/charts/hbar-list";
import { fmtBytes } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { isStorageConfigured, storageUsage, USER_QUOTA_BYTES } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Computed on the server so the client renders the identical list. */
function timeZones(current: string) {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
}
export async function generateMetadata() {
  return { title: (await getTranslations("settings"))("title") };
}

export default async function SettingsPage() {
  const { user, ctx } = await pageContext();
  const t = await getTranslations();
  const storage = isStorageConfigured();
  const used = storage ? await storageUsage(ctx) : 0;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="settings"
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />
      <div className="flex flex-col gap-6">
        <Card id="install">
          <CardHeader title={t("install.title")} icon={<AppWindow />} hue="blue" />
          <div className="px-5 pb-5">
            <InstallApp />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("settings.profile")} />
          <div className="px-5 pb-5">
            <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted text-xs">{t("settings.email")}</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">{t("settings.role")}</dt>
                <dd>
                  <Badge tone={user.role === "superadmin" ? "accent" : "neutral"}>
                    {t(`settings.roles.${user.role}`)}
                  </Badge>
                </dd>
              </div>
            </dl>
            <ProfileForm
              name={user.name}
              timezone={user.timezone}
              zones={timeZones(user.timezone)}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("settings.appearance")} />
          <div className="px-5 pb-5">
            <AppearanceForm />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("settings.storage")} />
          <div className="px-5 pb-5 text-sm">
            {storage ? (
              <>
                <ProgressBar value={used} max={USER_QUOTA_BYTES} label={t("settings.storage")} />
                <p className="text-muted mt-2">
                  {t("settings.storageUsed", {
                    used: fmtBytes(used),
                    total: fmtBytes(USER_QUOTA_BYTES),
                  })}
                </p>
              </>
            ) : (
              <p className="text-muted">{t("settings.storageOff")}</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-4" /> {t("settings.privacy")}
              </span>
            }
          />
          <p className="text-muted px-5 pb-5 text-sm">{t("settings.privacyBody")}</p>
        </Card>
      </div>
    </div>
  );
}

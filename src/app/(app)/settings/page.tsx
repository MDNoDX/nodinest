import { AppWindow, Keyboard, LifeBuoy, Lock } from "lucide-react";
import { ShortcutsSettings } from "@/components/settings/shortcuts";
import { InstallApp } from "@/components/pwa/install-app";
import { getTranslations } from "next-intl/server";
import { EditProfile } from "@/components/profile/edit-profile";
import { TimezoneForm, AppearanceForm } from "@/components/settings/settings-forms";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ProgressBar } from "@/components/charts/hbar-list";
import { fmtBytes } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { DeleteAccount } from "@/components/settings/delete-account";
import { ProfileVisibility } from "@/components/social/profile-visibility";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { isStorageConfigured, storageUsage, userQuotaBytes } from "@/server/storage";
import { StorageHint } from "@/components/write/storage-hint";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
      <PageHeader section="settings" title={t("settings.title")} />
      <div className="flex flex-col gap-6">
        <Card id="install">
          <CardHeader title={t("install.title")} icon={<AppWindow />} hue="blue" />
          <div className="px-5 pb-5">
            <InstallApp />
          </div>
        </Card>
        <Card className="border-[#1d9bf0]/30">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <PremiumBadge className="size-11" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">
                {user.isPremium ? t("premium.active") : t("premium.settingsTitle")}
              </h2>
              <p className="text-muted text-sm">{t("premium.settingsBody")}</p>
            </div>
            <Button asChild variant={user.isPremium ? "outline" : "primary"}>
              <Link href="/premium">{t("premium.open")}</Link>
            </Button>
          </div>
        </Card>
        <Card className="border-[var(--c-teal)]/30">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--c-teal)]/12 text-[var(--c-teal)]">
              <LifeBuoy className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{t("guide.settingsTitle")}</h2>
              <p className="text-muted text-sm">{t("guide.settingsBody")}</p>
            </div>
            <Button asChild>
              <Link href="/guide">{t("guide.title")}</Link>
            </Button>
          </div>
        </Card>
        <Card id="profile">
          <CardHeader title={t("settings.profile")} />
          <div className="px-5 pb-5">
            <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
              {!user.email.endsWith(".invalid") && (
                <div>
                  <dt className="text-muted text-xs">{t("settings.email")}</dt>
                  <dd>{user.email}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted text-xs">{t("settings.role")}</dt>
                <dd>
                  <Badge tone={user.role === "superadmin" ? "accent" : "neutral"}>
                    {t(`settings.roles.${user.role}`)}
                  </Badge>
                </dd>
              </div>
            </dl>
            <EditProfile
              userId={user.id}
              storage={storage}
              initial={{
                firstName: user.firstName ?? user.name,
                lastName: user.lastName ?? "",
                username: user.username ?? "",
                image: user.image,
              }}
            />
            <div className="border-border mt-6 border-t pt-5">
              <h3 className="mb-3 text-sm font-semibold">{t("social.visibilityTitle")}</h3>
              <ProfileVisibility
                initial={user.profilePublic}
                bio={user.bio}
                username={user.username}
              />
            </div>
            <div className="border-border mt-6 border-t pt-5">
              <TimezoneForm timezone={user.timezone} zones={timeZones(user.timezone)} />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("settings.appearance")} />
          <div className="px-5 pb-5">
            <AppearanceForm />
          </div>
        </Card>
        <Card id="shortcuts">
          <CardHeader title={t("shortcuts.title")} icon={<Keyboard />} hue="violet" />
          <div className="px-5 pb-5">
            <ShortcutsSettings />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("settings.storage")} />
          <div className="px-5 pb-5 text-sm">
            {storage ? (
              <>
                <ProgressBar value={used} max={userQuotaBytes()} label={t("settings.storage")} />
                <p className="text-muted mt-2">
                  {t("settings.storageUsed", {
                    used: fmtBytes(used),
                    total: fmtBytes(userQuotaBytes()),
                  })}
                </p>
                <div className="mt-3">
                  <StorageHint used={used} quota={userQuotaBytes()} />
                </div>
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
          <div className="flex flex-col gap-3 px-5 pb-5 text-sm">
            <p className="text-muted">{t("settings.privacyBody")}</p>
            <p className="flex gap-4">
              <Link href="/privacy" className="text-primary font-medium hover:underline">
                {t("legal.privacyTitle")}
              </Link>
              <Link href="/terms" className="text-primary font-medium hover:underline">
                {t("legal.termsTitle")}
              </Link>
            </p>
            {!user.isSuperadmin && (
              <div className="border-border flex flex-col gap-2 border-t pt-3">
                <p className="text-muted">{t("settings.deleteAccount.hint")}</p>
                <div>
                  <DeleteAccount />
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

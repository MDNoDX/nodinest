import {
  AppWindow,
  HardDrive,
  Keyboard,
  LifeBuoy,
  ListOrdered,
  Lock,
  Palette,
  UserRound,
} from "lucide-react";
import { ShortcutsSettings } from "@/components/settings/shortcuts";
import { InstallApp } from "@/components/pwa/install-app";
import { getTranslations } from "next-intl/server";
import { EditProfile } from "@/components/profile/edit-profile";
import { TimezoneForm, AppearanceForm } from "@/components/settings/settings-forms";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ProgressBar } from "@/components/charts/hbar-list";
import { fmtBytes } from "@/lib/format";
import { pageContext, sp, type SP } from "@/lib/page";
import { cn } from "@/lib/cn";
import { PremiumPanel } from "@/components/premium/premium-panel";
import { DeleteAccount } from "@/components/settings/delete-account";
import { NavOrderSettings } from "@/components/settings/nav-order";
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

const TABS = [
  ["profile", UserRound],
  ["premium", null],
  ["look", Palette],
  ["menu", ListOrdered],
  ["keys", Keyboard],
  ["app", AppWindow],
  ["storage", HardDrive],
  ["privacy", Lock],
  ["help", LifeBuoy],
] as const;
type Tab = (typeof TABS)[number][0];

/** Settings in sections (one at a time): a side list on wide screens, chips on phones. */
export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const { user, ctx } = await pageContext();
  const t = await getTranslations();
  const asked = sp((await searchParams).tab);
  const tab: Tab = TABS.some(([k]) => k === asked) ? (asked as Tab) : "profile";
  const storage = isStorageConfigured();
  const used = storage && tab === "storage" ? await storageUsage(ctx) : 0;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader section="settings" title={t("settings.title")} />
      <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
        <nav
          aria-label={t("settings.title")}
          className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:sticky md:top-20 md:mx-0 md:flex-col md:self-start md:overflow-visible md:px-0"
        >
          {TABS.map(([k, Icon]) => (
            <Link
              key={k}
              href={`/settings?tab=${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                tab === k
                  ? "bg-surface text-foreground shadow-sm ring-1 ring-[var(--border)]"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="size-4" /> : <PremiumBadge className="size-4" />}
              {t(`settings.tabs.${k}`)}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          {tab === "app" && (
            <Card id="install">
              <CardHeader title={t("install.title")} icon={<AppWindow />} hue="blue" />
              <div className="px-5 pb-5">
                <InstallApp />
              </div>
            </Card>
          )}
          {tab === "premium" && <PremiumPanel ctx={ctx} user={user} />}
          {tab === "help" && (
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
          )}
          {tab === "profile" && (
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
                  {(user.isSuperadmin || user.adminPerms.length > 0) && (
                    <div>
                      <dt className="text-muted text-xs">{t("settings.role")}</dt>
                      <dd className="flex flex-wrap items-center gap-2">
                        <Badge tone="accent">
                          {t(`settings.roles.${user.isSuperadmin ? "superadmin" : "admin"}`)}
                        </Badge>
                        {!user.isSuperadmin && (
                          <span className="text-muted text-xs">
                            {user.adminPerms.map((p) => t(`admin.perms.${p}`)).join(", ")}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
                <EditProfile
                  userId={user.id}
                  storage={storage}
                  initial={{
                    firstName: user.firstName ?? user.name,
                    lastName: user.lastName ?? "",
                    username: user.username ?? "",
                    image: user.image,
                    phone: user.phone ?? "",
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
          )}
          {tab === "look" && (
            <Card>
              <CardHeader title={t("settings.appearance")} />
              <div className="px-5 pb-5">
                <AppearanceForm />
              </div>
            </Card>
          )}
          {tab === "menu" && (
            <Card id="menu">
              <CardHeader title={t("settings.navOrder")} icon={<ListOrdered />} hue="teal" />
              <div className="px-5 pb-5">
                <NavOrderSettings />
              </div>
            </Card>
          )}
          {tab === "keys" && (
            <Card id="shortcuts">
              <CardHeader title={t("shortcuts.title")} icon={<Keyboard />} hue="violet" />
              <div className="px-5 pb-5">
                <ShortcutsSettings />
              </div>
            </Card>
          )}
          {tab === "storage" && (
            <Card>
              <CardHeader title={t("settings.storage")} />
              <div className="px-5 pb-5 text-sm">
                {storage ? (
                  <>
                    <ProgressBar
                      value={used}
                      max={userQuotaBytes()}
                      label={t("settings.storage")}
                    />
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
          )}
          {tab === "privacy" && (
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
          )}
        </div>
      </div>
    </div>
  );
}

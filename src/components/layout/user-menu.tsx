"use client";
import { Check, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { DropdownMenu as M } from "radix-ui";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/personal";
import { clearOfflineData } from "@/components/pwa/pwa";
import { authClient } from "@/lib/auth/client";
import { Avatar } from "@/components/ui/avatar";
import { LOCALES } from "@/i18n/config";
import { PremiumBadge } from "@/components/premium/premium-badge";

const item =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2";

export function UserMenu({
  user,
}: {
  user: {
    name: string;
    email: string;
    image: string | null;
    role: string;
    username?: string | null;
    premium?: boolean;
  };
}) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const [, start] = useTransition();

  return (
    <M.Root>
      <M.Trigger className="rounded-full" aria-label={t("nav.account")}>
        <Avatar name={user.name} image={user.image} />
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={8}
          className="border-border bg-surface animate-scale-in z-50 w-64 rounded-xl border p-1.5 shadow-xl"
        >
          <div className="px-2 py-2">
            <div className="flex items-center gap-1 truncate text-sm font-semibold">
              {user.name} {user.premium && <PremiumBadge />}
            </div>
            <div className="text-muted truncate text-xs">
              {user.username ? `@${user.username}` : user.email}
            </div>
          </div>
          <M.Separator className="bg-border my-1 h-px" />
          <M.Label className="text-muted px-2 pt-1 pb-0.5 text-xs">{t("theme.label")}</M.Label>
          {(
            [
              ["light", Sun],
              ["dark", Moon],
              ["system", Monitor],
            ] as const
          ).map(([value, Icon]) => (
            <M.Item
              key={value}
              className={item}
              onSelect={(e) => {
                e.preventDefault();
                setTheme(value);
              }}
            >
              <Icon className="text-muted size-4" /> {t(`theme.${value}`)}
              {theme === value && <Check className="text-primary ml-auto size-4" />}
            </M.Item>
          ))}
          <M.Separator className="bg-border my-1 h-px" />
          <M.Label className="text-muted px-2 pt-1 pb-0.5 text-xs">{t("locale.label")}</M.Label>
          {LOCALES.map((l) => (
            <M.Item
              key={l}
              className={item}
              onSelect={() =>
                start(async () => {
                  await setLocaleAction(l);
                  router.refresh();
                })
              }
            >
              <span className="text-muted w-4 text-center text-xs font-semibold uppercase">
                {l}
              </span>{" "}
              {t(`locale.${l}`)}
              {locale === l && <Check className="text-primary ml-auto size-4" />}
            </M.Item>
          ))}
          <M.Separator className="bg-border my-1 h-px" />
          <M.Item asChild className={item}>
            <Link href="/settings">
              <Settings className="text-muted size-4" /> {t("nav.settings")}
            </Link>
          </M.Item>
          <M.Item asChild className={item}>
            <Link href="/premium">
              <PremiumBadge /> Premium
            </Link>
          </M.Item>
          <M.Item
            className={item}
            onSelect={async () => {
              await authClient.signOut();
              await clearOfflineData();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut className="text-muted size-4" /> {t("nav.signOut")}
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

"use client";
import {
  Bell,
  Smartphone,
  CheckCircle2,
  Download,
  EllipsisVertical,
  Laptop,
  Share,
  SquarePlus,
  WifiOff,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { LogoSymbol } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { isStandalone, runInstall, useInstallPrompt } from "@/lib/install-prompt";

const noop = () => () => {};
type Platform = "ios" | "ios-other" | "mac-safari" | "android" | "desktop" | "server";
function platform(): Platform {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac)
    return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua))
    return "mac-safari";
  return "desktop";
}

/**
 * Settings → App: Röznoma installed as a real app — its own icon among the
 * phone's apps, its own window without the browser bar, offline pages and
 * notifications. On Android and computers the browser's own install dialog
 * opens with one tap; an iPhone allows it only through Safari's Share menu,
 * so the three steps are shown as they look there.
 */
export function InstallApp() {
  const t = useTranslations("install");
  const { prompt, installed } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const p = useSyncExternalStore(noop, platform, () => "server" as const);
  const standalone = useSyncExternalStore(noop, isStandalone, () => false);
  const mac = useSyncExternalStore(
    noop,
    () => /Macintosh/.test(navigator.userAgent),
    () => false,
  );

  if (standalone || installed)
    return (
      <p className="text-success flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="size-4" /> {t("installed")}
      </p>
    );

  const gains = [
    [Zap, t("gainFast")],
    [WifiOff, t("gainOffline")],
    [Bell, t("gainPush")],
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <LogoSymbol className="size-16 shrink-0 rounded-2xl shadow-lg" />
        <div className="min-w-0">
          <p className="text-lg font-bold">Röznoma</p>
          <p className="text-muted text-sm">{t("tagline")}</p>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {gains.map(([Icon, text]) => (
          <li key={text} className="bg-surface-2 flex items-start gap-2 rounded-xl p-3 text-[13px]">
            <Icon className="text-primary mt-0.5 size-4 shrink-0" /> {text}
          </li>
        ))}
      </ul>

      {prompt ? (
        // Android / Chrome: the browser installs it as an app (on Android a real
        // app in the app list, not a bookmark).
        <Button
          size="lg"
          className="w-full sm:w-auto sm:self-start"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await runInstall(prompt);
            setBusy(false);
          }}
        >
          <Download /> {t("installNow")}
        </Button>
      ) : p === "ios" ? (
        <Steps
          title={t("iosTitle")}
          steps={[
            [<Share key="s" className="size-5" />, t("ios1")],
            [<SquarePlus key="p" className="size-5" />, t("ios2")],
            [
              <span key="a" className="text-sm font-bold">
                {t("iosAdd")}
              </span>,
              t("ios3"),
            ],
          ]}
          note={t("iosNote")}
        />
      ) : p === "ios-other" ? (
        <p className="bg-surface-2 rounded-xl p-4 text-sm">{t("iosOther")}</p>
      ) : p === "android" ? (
        <Steps
          title={t("androidTitle")}
          steps={[
            [<EllipsisVertical key="m" className="size-5" />, t("android1")],
            [<Download key="d" className="size-5" />, t("android2")],
          ]}
          note={t("androidNote")}
        />
      ) : null}

      {/* Android: the app itself as a file too (works on every Android browser). */}
      {p === "android" && (
        <div className="border-border flex flex-col gap-3 rounded-2xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="size-4 text-[var(--c-emerald)]" /> {t("androidTitleApk")}
            <span className="text-muted ml-auto text-xs font-normal">{t("androidSize")}</span>
          </div>
          {/* A file download (a redirect to the store), not a page: a plain link. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/download/android"
            className="bg-primary text-primary-foreground inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-transform active:scale-95"
          >
            <Download className="size-4" /> {t("androidDownload")}
          </a>
          <ol className="text-muted list-decimal space-y-1 pl-4 text-[13px] leading-relaxed">
            {[1, 2, 3].map((i) => (
              <li key={i}>{t(`androidApk${i}`)}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Computers: the apps themselves, as files (a Mac .dmg, a Windows installer). */}
      {(p === "desktop" || p === "mac-safari" || p === "server") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(mac ? (["mac", "windows"] as const) : (["windows", "mac"] as const)).map((os) => (
            <div key={os} className="border-border flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Laptop className="size-4 text-[var(--c-blue)]" /> {t(`${os}Title`)}
                <span className="text-muted ml-auto text-xs font-normal">{t(`${os}Size`)}</span>
              </div>
              <a
                href={`/api/download/${os}`}
                className="bg-primary text-primary-foreground inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-transform active:scale-95"
              >
                <Download className="size-4" /> {t(`${os}Download`)}
              </a>
              <ol className="text-muted list-decimal space-y-1 pl-4 text-[13px] leading-relaxed">
                {[1, 2, 3].map((i) => (
                  <li key={i}>{t(`${os}Step${i}`)}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {(p === "desktop" || p === "mac-safari") && (
        <p className="text-muted text-[13px] leading-relaxed">
          {p === "mac-safari" ? t("macSafari") : t("macChrome")}
        </p>
      )}
      <p className="text-muted text-xs">{t("offlineNote")}</p>
    </div>
  );
}

/** Numbered steps, each with the icon the person will see on their screen. */
function Steps({
  title,
  steps,
  note,
}: {
  title: string;
  steps: [React.ReactNode, string][];
  note?: string;
}) {
  return (
    <div className="border-border rounded-2xl border p-4">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <ol className="flex flex-col gap-3">
        {steps.map(([icon, text], i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              {i + 1}
            </span>
            <span className="bg-surface-2 text-primary grid h-10 min-w-10 shrink-0 place-items-center rounded-xl px-2">
              {icon}
            </span>
            <span className="min-w-0">{text}</span>
          </li>
        ))}
      </ol>
      {note && <p className="text-muted mt-3 text-xs leading-relaxed">{note}</p>}
    </div>
  );
}

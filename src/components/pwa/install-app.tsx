"use client";
import { CheckCircle2, Download, Laptop, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const noop = () => () => {};
function platform(): "ios" | "mac-safari" | "android" | "desktop" | "server" {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua))
    return "mac-safari";
  return "desktop";
}

/**
 * NodiNote as an app on Mac, iPhone/iPad and Android — installed from the
 * browser (no store, no cost), works offline for everything already opened.
 */
export function InstallApp() {
  const t = useTranslations("install");
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [done, setDone] = useState(false);
  const p = useSyncExternalStore(noop, platform, () => "server" as const);
  const standalone = useSyncExternalStore(
    noop,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || done)
    return (
      <p className="text-success flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="size-4" /> {t("installed")}
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">{t("why")}</p>
      {prompt && (
        <Button
          className="self-start"
          onClick={async () => {
            await prompt.prompt();
            const r = await prompt.userChoice;
            if (r.outcome === "accepted") setDone(true);
            setPrompt(null);
          }}
        >
          <Download /> {t("installNow")}
        </Button>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border-border rounded-xl border p-4">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <Laptop className="size-4 text-[var(--c-blue)]" /> {t("mac")}
          </div>
          <p className="text-muted text-[13px] leading-relaxed">
            {p === "mac-safari" ? t("macSafari") : t("macChrome")}
          </p>
        </div>
        <div className="border-border rounded-xl border p-4">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="size-4 text-[var(--c-violet)]" /> {t("phone")}
          </div>
          <p className="text-muted text-[13px] leading-relaxed">
            {p === "android" ? t("android") : t("ios")}
          </p>
        </div>
      </div>
      <p className="text-muted text-xs">{t("offlineNote")}</p>
    </div>
  );
}

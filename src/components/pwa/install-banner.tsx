"use client";
import { Download, Share, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LogoSymbol } from "@/components/brand/logo";
import { isStandalone, runInstall, useInstallPrompt } from "@/lib/install-prompt";

const HIDE_KEY = "nn:install-hidden";

/**
 * Phones, in the browser: "Put Röznoma on the home screen" — one tap on
 * Android (the browser's own install), two steps shown on iPhone (Share →
 * Add to Home Screen). Never inside the installed app; gone for a month once closed.
 */
export function InstallBanner() {
  const t = useTranslations("install");
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const { prompt } = useInstallPrompt();

  useEffect(() => {
    const phone = matchMedia("(max-width: 767px)").matches;
    let away = false;
    try {
      away = Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now();
    } catch {
      /* storage unavailable */
    }
    if (isStandalone() || !phone || away) return;
    const ua = navigator.userAgent;
    // iPhone: shown after a moment; Android: once the browser offers to install.
    const timer = setTimeout(() => {
      setIos(/iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua));
      setHidden(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);
  const show = hidden ? null : prompt ? "android" : ios ? "ios" : null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + 30 * 86_400_000));
    } catch {
      /* storage unavailable */
    }
  };

  if (!show) return null;
  return (
    <div className="animate-slide-up bg-surface border-border fixed inset-x-3 bottom-[calc(var(--bottom-nav,0px)+0.75rem)] z-40 flex items-center gap-3 rounded-2xl border p-3 shadow-2xl md:hidden">
      <LogoSymbol className="size-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("bannerTitle")}</p>
        <p className="text-muted text-xs leading-snug">
          {show === "ios" ? (
            <>
              {t("bannerIos1")} <Share className="inline size-3.5 -translate-y-px" />{" "}
              {t("bannerIos2")}
            </>
          ) : (
            t("bannerAndroid")
          )}
        </p>
      </div>
      {show === "android" && prompt && (
        <button
          type="button"
          onClick={async () => {
            await runInstall(prompt);
            setHidden(true);
          }}
          className="bg-primary text-primary-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
        >
          <Download className="size-4" /> {t("bannerInstall")}
        </button>
      )}
      <button
        type="button"
        onClick={close}
        aria-label={t("bannerClose")}
        className="text-muted grid size-8 shrink-0 place-items-center rounded-full"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

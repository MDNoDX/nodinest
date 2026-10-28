"use client";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const NEXT_KEY = "nn-login-next";

/** Telegram's paper-plane mark. */
export function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <circle cx="12" cy="12" r="12" fill="#2AABEE" />
      <path
        fill="#fff"
        d="M5.4 11.8 16.9 7.3c.5-.2 1 .1.8 1l-2 9.3c-.1.6-.6.8-1.1.5l-3-2.2-1.5 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5.1c.2-.2 0-.3-.3-.1l-7 4.4-3-.9c-.6-.2-.6-.6.1-.9Z"
      />
    </svg>
  );
}

/** Sends the user to Telegram to confirm the sign-in; Telegram returns to /login/telegram. */
export function telegramLogin(botId: string, next: string) {
  try {
    sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    /* ignore */
  }
  const origin = window.location.origin;
  const u = new URL("https://oauth.telegram.org/auth");
  u.searchParams.set("bot_id", botId);
  u.searchParams.set("origin", origin);
  u.searchParams.set("request_access", "write");
  u.searchParams.set("return_to", `${origin}/login/telegram`);
  window.location.assign(u.toString());
}

function decode(hash: string): Record<string, unknown> | null {
  const m = /tgAuthResult=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    let b = decodeURIComponent(m[1]).replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    const json = new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Back from Telegram: post the signed data, then go on (or show what went wrong). */
export function TelegramReturn() {
  const t = useTranslations("auth");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const data = decode(window.location.hash);
    history.replaceState(null, "", window.location.pathname);
    let next = "/resume";
    try {
      const n = sessionStorage.getItem(NEXT_KEY);
      if (n && /^\/(?![/\\])/.test(n)) next = n;
      sessionStorage.removeItem(NEXT_KEY);
    } catch {
      /* ignore */
    }
    if (!data) {
      queueMicrotask(() => setFailed(true));
      return;
    }
    void fetch("/api/auth/telegram/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((r) => {
        if (r.ok) window.location.replace(next);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);
  return failed ? (
    <div className="card flex max-w-sm flex-col items-center gap-3 p-6 text-center">
      <p className="font-medium">{t("failed")}</p>
      <Button asChild>
        <Link href="/login">{t("signIn")}</Link>
      </Button>
    </div>
  ) : (
    <p className="text-muted flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" /> {t("telegramSigningIn")}
    </p>
  );
}

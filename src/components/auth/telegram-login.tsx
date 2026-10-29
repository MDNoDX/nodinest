"use client";
import { Loader2, RefreshCw, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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

type Start = { code: string; link: string; app: string; expiresIn: number };
const isPhone = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * "Continue with Telegram": a code is confirmed in the site's bot (no phone
 * number, no SMS). Phones jump straight into the Telegram app; computers show
 * a QR code and a button. The dialog waits and signs in by itself.
 */
export function TelegramLogin({ next, disabled }: { next: string; disabled?: boolean }) {
  const t = useTranslations("auth.tg");
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Start | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "wait" | "expired" | "error" | "ok">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const begin = useCallback(async () => {
    stop();
    setState("wait");
    setStart(null);
    setQr(null);
    // Better Auth accepts only JSON POSTs (an empty one is 415).
    const r = await fetch("/api/auth/telegram/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    if (!r?.ok) {
      setState("error");
      return;
    }
    const s = (await r.json()) as Start;
    setStart(s);
    void QRCode.toDataURL(s.link, { margin: 1, width: 360 }).then(setQr, () => {});
    if (isPhone()) window.location.href = s.app;
    const until = Date.now() + s.expiresIn * 1000;
    const poll = async () => {
      if (Date.now() > until) return setState("expired");
      const p = await fetch("/api/auth/telegram/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: s.code }),
      }).catch(() => null);
      const d = p?.ok ? ((await p.json()) as { state: string }) : { state: "pending" };
      if (d.state === "ok") {
        setState("ok");
        window.location.replace(next);
        return;
      }
      if (d.state === "gone") return setState("expired");
      timer.current = setTimeout(() => void poll(), document.hidden ? 3000 : 1500);
    };
    timer.current = setTimeout(() => void poll(), 1500);
  }, [next]);

  // Stop waiting when the page goes away.
  useEffect(() => stop, []);

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          void begin();
        }}
      >
        <TelegramIcon /> {t("button")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            stop();
            setState("idle");
          }
        }}
      >
        <DialogContent title={t("title")} description={t("body")} closeLabel={t("close")}>
          <div className="mt-2 flex flex-col items-center gap-4 text-center">
            {state === "expired" || state === "error" ? (
              <>
                <p className="text-muted text-sm">
                  {state === "expired" ? t("expired") : t("error")}
                </p>
                <Button onClick={() => void begin()}>
                  <RefreshCw /> {t("again")}
                </Button>
              </>
            ) : state === "ok" ? (
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> {t("signingIn")}
              </p>
            ) : (
              <>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt={t("qr")}
                    className="size-44 rounded-xl border bg-white p-2 max-sm:hidden"
                  />
                ) : (
                  <div className="bg-surface-2 grid size-44 place-items-center rounded-xl max-sm:hidden">
                    <Loader2 className="text-muted size-6 animate-spin" />
                  </div>
                )}
                <p className="text-muted text-sm max-sm:hidden">{t("scan")}</p>
                <Button asChild size="lg" className="w-full" disabled={!start}>
                  <a href={start?.link ?? "#"} target="_blank" rel="noopener noreferrer">
                    <Smartphone /> {t("open")}
                  </a>
                </Button>
                <p className="text-muted flex items-center gap-2 text-xs">
                  <Loader2 className="size-3.5 animate-spin" /> {t("waiting")}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

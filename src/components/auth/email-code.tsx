"use client";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

/** Sign in (or up) with a 6-digit code sent to the e-mail. */
export function EmailCode({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!sent)
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
            if (r.error) setError(t("failed"));
            else setSent(true);
          });
        }}
      >
        <Input
          type="email"
          required
          autoComplete="email"
          placeholder="email@example.com"
          aria-label={t("email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="outline" loading={pending} className="shrink-0">
          <Mail /> {t("sendCode")}
        </Button>
        {error && <p className="text-danger text-xs">{error}</p>}
      </form>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await authClient.signIn.emailOtp({ email, otp: code.trim() });
          if (r.error) setError(t("badCode"));
          else window.location.replace(next);
        });
      }}
    >
      <p className="text-muted text-xs">{t("codeSent", { email })}</p>
      <div className="flex gap-2">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          aria-label={t("code")}
          placeholder="••••••"
          className="text-center font-mono text-lg tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <Button type="submit" loading={pending} disabled={code.length !== 6} className="shrink-0">
          {t("verify")}
        </Button>
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
      <button
        type="button"
        className="text-muted hover:text-foreground self-start text-xs underline"
        onClick={() => {
          setSent(false);
          setCode("");
        }}
      >
        {t("changeEmail")}
      </button>
    </form>
  );
}

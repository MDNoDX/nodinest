"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { checkResetAction, confirmResetAction, requestResetAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput, PasswordRules } from "@/components/ui/password-input";
import { passwordOk } from "@/lib/password";

const RESEND_S = 60;

/** Back into an account without Google: who you are, the code, a new password. */
export function ForgotPassword({
  login: known = "",
  onDone,
  onBack,
}: {
  /** Signed in: who we are is known, so the first step is one button. */
  login?: string;
  /** Saved; the caller signs in with these. */
  onDone: (login: string, password: string) => void | Promise<void>;
  onBack?: () => void;
}) {
  const t = useTranslations("auth");
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"who" | "code" | "password">("who");
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ login: known, code: "", next: "", again: "" });
  const ok = passwordOk(v.next) && v.next === v.again;

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await requestResetAction(v.login);
      if (!r.ok) return setError(t(r.code === "RATE_LIMITED" ? "tooMany" : "failed"));
      if (!r.data.to && !r.data.bot) return setError(t("resetNoUser"));
      setSentTo(r.data.bot ? t("resetSentBot") : t("resetSentTo", { to: r.data.to ?? "" }));
      setV((x) => ({ ...x, code: "" }));
      setWait(RESEND_S);
      setStep("code");
    });
  const check = () =>
    start(async () => {
      setError(null);
      const r = await checkResetAction(v.login, v.code);
      if (r.ok) setStep("password");
      else setError(t(r.code === "RATE_LIMITED" ? "tooMany" : "badCode"));
    });
  const save = () =>
    start(async () => {
      setError(null);
      const r = await confirmResetAction(v.login, v.code, v.next);
      if (r.ok) await onDone(v.login, v.next);
      else setError(t(r.code === "RATE_LIMITED" ? "tooMany" : "badCode"));
    });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "who") {
          if (v.login.trim()) ask();
        } else if (step === "code") {
          if (/^\d{6}$/.test(v.code)) check();
        } else if (ok) save();
      }}
    >
      {step === "who" && (
        <>
          {!known && (
            <Field label={t("usernameOrEmail")}>
              {(p) => (
                <Input
                  {...p}
                  required
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={v.login}
                  onChange={(e) => setV({ ...v, login: e.target.value })}
                />
              )}
            </Field>
          )}
          <p className="text-muted text-sm">{t("resetHint")}</p>
          <Button type="submit" loading={pending} disabled={!v.login.trim()}>
            {t("sendCode")}
          </Button>
        </>
      )}
      {step === "code" && (
        <>
          <p className="text-muted text-sm">{sentTo}</p>
          <Field label={t("resetCode")}>
            {(p) => (
              <Input
                {...p}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={v.code}
                onChange={(e) => setV({ ...v, code: e.target.value.replace(/\D/g, "") })}
              />
            )}
          </Field>
          <Button type="submit" loading={pending} disabled={!/^\d{6}$/.test(v.code)}>
            {t("resetCheck")}
          </Button>
          <button
            type="button"
            onClick={ask}
            disabled={wait > 0 || pending}
            className="text-muted enabled:hover:text-foreground self-center text-sm tabular-nums"
          >
            {wait > 0 ? t("resetWait", { n: wait }) : t("resetAgain")}
          </button>
        </>
      )}
      {step === "password" && (
        <>
          <p className="text-muted text-sm">{t("resetNewHint")}</p>
          <Field label={t("newPassword")}>
            {(p) => (
              <PasswordInput
                {...p}
                autoFocus
                autoComplete="new-password"
                value={v.next}
                onChange={(e) => setV({ ...v, next: e.target.value })}
              />
            )}
          </Field>
          <PasswordRules value={v.next} />
          <Field
            label={t("repeatPassword")}
            error={v.again && v.again !== v.next ? t("passwordsDiffer") : undefined}
          >
            {(p) => (
              <PasswordInput
                {...p}
                autoComplete="new-password"
                value={v.again}
                onChange={(e) => setV({ ...v, again: e.target.value })}
              />
            )}
          </Field>
          <Button type="submit" loading={pending} disabled={!ok}>
            {t("savePassword")}
          </Button>
        </>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-muted hover:text-foreground self-center text-sm"
        >
          {t("back")}
        </button>
      )}
    </form>
  );
}

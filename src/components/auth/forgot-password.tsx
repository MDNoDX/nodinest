"use client";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { confirmResetAction, requestResetAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput, PasswordRules } from "@/components/ui/password-input";
import { passwordOk } from "@/lib/password";

/** A code to the e-mail / bot, then a new password. */
export function ForgotPassword({
  login: known = "",
  onDone,
  onBack,
}: {
  /** Signed in: who we are is known, so the first step is one button. */
  login?: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations("auth");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ login: known, code: "", next: "", again: "" });
  const ok = /^\d{6}$/.test(v.code.trim()) && passwordOk(v.next) && v.next === v.again;
  const ask = () =>
    start(async () => {
      setError(null);
      const r = await requestResetAction(v.login);
      if (r.ok) setSent(true);
      else setError(t(r.code === "RATE_LIMITED" ? "tooMany" : "failed"));
    });
  const save = () =>
    start(async () => {
      setError(null);
      const r = await confirmResetAction(v.login, v.code, v.next);
      if (r.ok) onDone();
      else setError(t(r.code === "RATE_LIMITED" ? "tooMany" : "badCode"));
    });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (sent) {
          if (ok) save();
        } else if (v.login.trim()) ask();
      }}
    >
      {!sent ? (
        <>
          {!known && (
            <Field label={t("usernameOrEmail")}>
              {(p) => (
                <Input
                  {...p}
                  required
                  autoFocus
                  autoComplete="username"
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
      ) : (
        <>
          <p className="text-muted text-sm">{t("resetSent")}</p>
          <Field label={t("resetCode")}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={v.code}
                onChange={(e) => setV({ ...v, code: e.target.value.replace(/\D/g, "") })}
              />
            )}
          </Field>
          <Field label={t("newPassword")}>
            {(p) => (
              <PasswordInput
                {...p}
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

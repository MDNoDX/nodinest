"use client";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";
import { setLocaleAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { loginAction } from "@/app/actions/account";
import { authClient } from "@/lib/auth/client";
import { isNativeApp, openSystemSignIn } from "@/lib/native";
import { ForgotPassword } from "./forgot-password";
import { LOCALES, localeKey } from "@/i18n/config";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
      />
    </svg>
  );
}

/** Apps' own browsers (Telegram, Instagram…): Google refuses to sign in there. */
const IN_APP =
  /FBAN|FBAV|Instagram|Telegram|TikTok|musical_ly|Line\/|MicroMessenger|; wv\)|(iPhone|iPad|iPod)(?!.*Safari)/i;

export function LoginPanel({
  googleEnabled,
  googleFailed = false,
  devEnabled,
  next = "/",
}: {
  googleEnabled: boolean;
  /** Back from Google without success. */
  googleFailed?: boolean;
  devEnabled: boolean;
  /** Where to go after signing in (validated same-site path). */
  next?: string;
}) {
  const t = useTranslations("auth");
  const tl = useTranslations("locale");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [login, setLogin] = useState({ name: "", password: "" });
  const [forgot, setForgot] = useState(false);
  const [signup, setSignup] = useState(false);
  const [copied, setCopied] = useState(false);
  const inApp = useSyncExternalStore(
    () => () => {},
    () => IN_APP.test(navigator.userAgent) && !isNativeApp(),
    () => false,
  );
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const google = () =>
    start(async () => {
      setError(null);
      if (isNativeApp()) return void (await openSystemSignIn());
      const r = await authClient.signIn.social({
        provider: "google",
        callbackURL: next,
        errorCallbackURL: `/login?google=failed&next=${encodeURIComponent(next)}`,
      });
      if (r.error) setError(t("googleFailed"));
    });

  const password = () =>
    start(async () => {
      setError(null);
      const r = await loginAction(login.name, login.password);
      if (!r.ok) setError(t(r.code === "RATE_LIMITED" ? "tooMany" : "badLogin"));
      else window.location.assign(next);
    });

  const dev = (mode: "in" | "up") =>
    start(async () => {
      setError(null);
      const r =
        mode === "in"
          ? await authClient.signIn.email({ email: form.email, password: form.password })
          : await authClient.signUp.email({
              email: form.email,
              password: form.password,
              name: form.name || form.email.split("@")[0],
            });
      if (r.error) setError(t("failed"));
      else {
        router.push(next);
        router.refresh();
      }
    });

  return (
    <div className="card p-6 shadow-sm" data-hydrated={hydrated ? "true" : undefined}>
      <div className="flex flex-col gap-3">
        {forgot || signup ? (
          <ForgotPassword
            signup={signup}
            onBack={() => {
              setForgot(false);
              setSignup(false);
            }}
            onDone={async (who, pass) => {
              const r = await loginAction(who, pass);
              if (r.ok) window.location.assign(next);
              else {
                setForgot(false);
                setSignup(false);
                setError(t("failed"));
              }
            }}
          />
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              password();
            }}
          >
            <Input
              required
              value={login.name}
              onChange={(e) => setLogin({ ...login, name: e.target.value })}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("usernameOrEmail")}
              aria-label={t("usernameOrEmail")}
            />
            <PasswordInput
              required
              value={login.password}
              onChange={(e) => setLogin({ ...login, password: e.target.value })}
              autoComplete="current-password"
              placeholder={t("password")}
              aria-label={t("password")}
            />
            <Button type="submit" size="lg" loading={pending}>
              {t("signIn")}
            </Button>
            <button
              type="button"
              onClick={() => setForgot(true)}
              className="text-muted hover:text-foreground self-center text-sm"
            >
              {t("forgot")}
            </button>
          </form>
        )}
        {!forgot && !signup && (
          <>
            {inApp ? (
              <div className="bg-warning-soft text-warning flex flex-col gap-2 rounded-lg p-3 text-sm">
                <p>{t("inAppBrowser")}</p>
                <button
                  type="button"
                  className="self-start font-semibold underline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(window.location.href);
                    setCopied(true);
                  }}
                >
                  {t(copied ? "linkCopied" : "copyLink")}
                </button>
              </div>
            ) : (
              <Button
                size="lg"
                variant="outline"
                onClick={google}
                disabled={!googleEnabled}
                loading={pending && googleEnabled}
              >
                <GoogleIcon /> {t("withGoogle")}
              </Button>
            )}
            {googleFailed && !inApp && (
              <p role="alert" className="bg-danger-soft text-danger rounded-lg p-3 text-sm">
                {t("googleFailed")}
              </p>
            )}
            <Button size="lg" variant="outline" onClick={() => setSignup(true)}>
              <Mail /> {t("signupWithEmail")}
            </Button>
          </>
        )}
        {!googleEnabled && (
          <p className="bg-warning-soft text-warning rounded-lg p-3 text-xs">
            {t("googleMissing")}
          </p>
        )}
      </div>

      {devEnabled && (
        <form
          data-testid="dev-login"
          className="border-border-strong mt-6 flex flex-col gap-3 border-t border-dashed pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            dev("in");
          }}
        >
          <div>
            <h2 className="text-sm font-semibold">{t("devTitle")}</h2>
            <p className="text-muted text-xs">{t("devHint")}</p>
          </div>
          <Field label={t("name")} optional>
            {(p) => (
              <Input
                {...p}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="name"
              />
            )}
          </Field>
          <Field label={t("email")}>
            {(p) => (
              <Input
                {...p}
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            )}
          </Field>
          <Field label={t("password")}>
            {(p) => (
              <Input
                {...p}
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" loading={pending}>
              {t("signIn")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={pending}
              onClick={() => dev("up")}
            >
              {t("signUp")}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="bg-danger-soft text-danger mt-4 rounded-lg p-3 text-sm">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-center gap-1 text-xs" aria-label={tl("label")}>
        {LOCALES.map((l) => (
          <button
            key={l}
            className={`rounded-md px-2 py-1 ${locale === l ? "bg-surface-2 font-semibold" : "text-muted hover:text-foreground"}`}
            aria-pressed={locale === l}
            onClick={() =>
              start(async () => {
                await setLocaleAction(l);
                router.refresh();
              })
            }
          >
            {tl(localeKey(l))}
          </button>
        ))}
      </div>
    </div>
  );
}

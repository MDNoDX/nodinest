"use client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setLocaleAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

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

export function LoginPanel({
  googleEnabled,
  devEnabled,
}: {
  googleEnabled: boolean;
  devEnabled: boolean;
}) {
  const t = useTranslations("auth");
  const tl = useTranslations("locale");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  const google = () =>
    start(async () => {
      setError(null);
      const r = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (r.error) setError(t("failed"));
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
        router.push("/");
        router.refresh();
      }
    });

  return (
    <div className="card p-6 shadow-sm">
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          variant="outline"
          onClick={google}
          disabled={!googleEnabled}
          loading={pending && googleEnabled}
        >
          <GoogleIcon /> {t("withGoogle")}
        </Button>
        {!googleEnabled && (
          <p className="bg-warning-soft text-warning rounded-lg p-3 text-xs">
            {t("googleMissing")}
          </p>
        )}
      </div>

      {devEnabled && (
        <form
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
        {(["uz", "en"] as const).map((l) => (
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
            {tl(l)}
          </button>
        ))}
      </div>
    </div>
  );
}

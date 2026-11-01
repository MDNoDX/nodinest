"use client";
import { Laptop, LogOut, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { changePasswordAction, removeDeviceAction, setPasswordAction } from "@/app/actions/account";
import { ForgotPassword } from "@/components/auth/forgot-password";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput, PasswordRules } from "@/components/ui/password-input";
import { passwordOk } from "@/lib/password";
import { useAction } from "@/lib/use-action";

/** Set a first password, or change it (asks for the current one). */
export function PasswordForm({
  has,
  login,
  canReset = true,
}: {
  has: boolean;
  login: string;
  /** The owner's account recovers through Google, not by a code. */
  canReset?: boolean;
}) {
  const t = useTranslations("auth");
  const { pending, exec } = useAction();
  const [v, setV] = useState({ current: "", next: "", again: "" });
  const [forgot, setForgot] = useState(false);
  const router = useRouter();
  const ok = passwordOk(v.next) && v.next === v.again && (!has || !!v.current);
  if (forgot)
    return (
      <div className="max-w-md">
        <ForgotPassword
          login={login}
          onBack={() => setForgot(false)}
          onDone={() => {
            router.replace("/login");
          }}
        />
      </div>
    );
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        exec(() => (has ? changePasswordAction(v.current, v.next) : setPasswordAction(v.next)), {
          success: t("passwordSaved"),
          onSuccess: () => setV({ current: "", next: "", again: "" }),
        });
      }}
    >
      {has && (
        <Field label={t("currentPassword")}>
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="current-password"
              value={v.current}
              onChange={(e) => setV({ ...v, current: e.target.value })}
            />
          )}
        </Field>
      )}
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={!ok}>
          {t("savePassword")}
        </Button>
        {has && canReset && (
          <button
            type="button"
            onClick={() => setForgot(true)}
            className="text-muted hover:text-foreground text-sm"
          >
            {t("forgot")}
          </button>
        )}
      </div>
    </form>
  );
}

type Device = {
  id: string;
  name: string;
  os: string;
  phone: boolean;
  lastSeen: string;
  current: boolean;
};

/** Where this account is signed in (at most two devices). */
export function DevicesList({ devices, max }: { devices: Device[]; max: number }) {
  const t = useTranslations("settings.security");
  const { pending, exec } = useAction();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted text-sm">{t("devicesHint", { n: devices.length, max })}</p>
      <ul className="divide-border border-border divide-y rounded-xl border">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            {d.phone ? (
              <Smartphone className="text-muted size-5 shrink-0" />
            ) : (
              <Laptop className="text-muted size-5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {d.name}
                {d.os ? ` · ${d.os}` : ""}
              </div>
              <div className="text-muted text-xs">{d.current ? t("thisDevice") : d.lastSeen}</div>
            </div>
            {!d.current && (
              <Button
                size="sm"
                variant="ghost"
                loading={pending}
                onClick={() => exec(() => removeDeviceAction(d.id), { success: t("removed") })}
              >
                <LogOut /> {t("remove")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

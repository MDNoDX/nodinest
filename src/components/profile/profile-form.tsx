"use client";
import { AtSign, Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { checkUsernameAction, saveFullProfileAction } from "@/app/actions/personal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";
import { USERNAME_RE, normalizeUsername } from "@/lib/username";

export type ProfileValue = {
  firstName: string;
  lastName: string;
  username: string;
  image: string | null;
  /** Shown (and saved) only when editing a profile, not at /welcome. */
  phone?: string;
};

/**
 * Picture, first / last name and a unique username (checked while typing).
 * The same form at /welcome (first sign-in) and in Settings.
 */
export function ProfileForm({
  initial,
  userId,
  storage,
  submitLabel,
  onSaved,
}: {
  initial: ProfileValue;
  userId: string;
  storage: boolean;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const t = useTranslations("profile");
  const [v, setV] = useState(initial);
  const [check, setCheck] = useState<"idle" | "checking" | "free" | "taken" | "invalid">(
    initial.username ? "free" : "idle",
  );
  const { pending, exec } = useAction();
  const name = normalizeUsername(v.username);

  // Is the username free? (asked 400 ms after the last key)
  useEffect(() => {
    if (!name) return;
    if (!USERNAME_RE.test(name)) {
      queueMicrotask(() => setCheck("invalid"));
      return;
    }
    if (name === normalizeUsername(initial.username)) {
      queueMicrotask(() => setCheck("free"));
      return;
    }
    queueMicrotask(() => setCheck("checking"));
    const id = setTimeout(async () => {
      const r = await checkUsernameAction(name);
      setCheck(r.ok ? (r.data ? "free" : "taken") : "idle");
    }, 400);
    return () => clearTimeout(id);
  }, [name, initial.username]);

  const display = [v.firstName, v.lastName].filter(Boolean).join(" ") || "?";
  const ready = v.firstName.trim() && check === "free";

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        exec(
          () =>
            saveFullProfileAction({
              firstName: v.firstName,
              lastName: v.lastName || null,
              username: name,
              image: v.image,
              ...(v.phone === undefined ? {} : { phone: v.phone || null }),
            }),
          { success: t("saved"), onSuccess: () => onSaved?.() },
        );
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar name={display} image={v.image} className="size-20 text-xl" />
        <div className="flex flex-col gap-1.5">
          <FileUpload
            purpose="portrait"
            enabled={storage}
            userId={userId}
            label={t("photo")}
            onUploaded={(id) => setV((x) => ({ ...x, image: `/api/files/${id}` }))}
          />
          {v.image && (
            <button
              type="button"
              onClick={() => setV((x) => ({ ...x, image: null }))}
              className="text-muted hover:text-danger self-start text-xs"
            >
              {t("removePhoto")}
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("firstName")}>
          {(p) => (
            <Input
              {...p}
              required
              maxLength={60}
              autoComplete="given-name"
              value={v.firstName}
              onChange={(e) => setV({ ...v, firstName: e.target.value })}
            />
          )}
        </Field>
        <Field label={t("lastName")} optional>
          {(p) => (
            <Input
              {...p}
              maxLength={60}
              autoComplete="family-name"
              value={v.lastName}
              onChange={(e) => setV({ ...v, lastName: e.target.value })}
            />
          )}
        </Field>
      </div>
      <Field label={t("username")} hint={t("usernameHint")}>
        {(p) => (
          <div className="relative">
            <AtSign className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              {...p}
              required
              maxLength={30}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="pr-9 pl-9"
              value={v.username}
              onChange={(e) =>
                setV({ ...v, username: e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, "") })
              }
              aria-invalid={check === "taken" || check === "invalid"}
            />
            <span className="absolute top-1/2 right-3 -translate-y-1/2" aria-hidden>
              {check === "checking" ? (
                <Loader2 className="text-muted size-4 animate-spin" />
              ) : check === "free" ? (
                <Check className="size-4 text-[var(--c-emerald)]" />
              ) : check === "taken" || check === "invalid" ? (
                <X className="text-danger size-4" />
              ) : null}
            </span>
          </div>
        )}
      </Field>
      {v.phone !== undefined && (
        <Field label={t("phone")} optional hint={t("phoneHint")}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={24}
              placeholder="+998 90 123 45 67"
              value={v.phone}
              onChange={(e) => setV({ ...v, phone: e.target.value.replace(/[^\d+\s()-]/g, "") })}
            />
          )}
        </Field>
      )}
      <p
        className={
          check === "taken" || check === "invalid" ? "text-danger -mt-3 text-xs" : "sr-only"
        }
        aria-live="polite"
      >
        {check === "taken" ? t("taken") : check === "invalid" ? t("invalid") : ""}
      </p>
      <Button type="submit" size="lg" loading={pending} disabled={!ready} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

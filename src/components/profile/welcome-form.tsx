"use client";
import { useTranslations } from "next-intl";
import { ProfileForm, type ProfileValue } from "./profile-form";

/** /welcome: the profile form, then on to the app. */
export function WelcomeForm(props: { userId: string; storage: boolean; initial: ProfileValue }) {
  const t = useTranslations("welcome");
  return (
    <ProfileForm {...props} submitLabel={t("start")} onSaved={() => window.location.replace("/")} />
  );
}

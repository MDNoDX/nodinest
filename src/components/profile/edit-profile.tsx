"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProfileForm, type ProfileValue } from "./profile-form";

/** Settings → profile (same form as at /welcome). */
export function EditProfile(props: { userId: string; storage: boolean; initial: ProfileValue }) {
  const t = useTranslations("profile");
  const router = useRouter();
  return <ProfileForm {...props} submitLabel={t("save")} onSaved={() => router.refresh()} />;
}

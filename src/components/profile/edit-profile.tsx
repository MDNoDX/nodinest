"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProfileForm, type ProfileValue } from "./profile-form";

/**
 * Settings → profile (same form as at /welcome). Saved, it goes back where it
 * was opened from (`back`, or `onDone`) and every page shows the new photo/name.
 */
export function EditProfile({
  back,
  onDone,
  ...props
}: {
  userId: string;
  storage: boolean;
  initial: ProfileValue;
  back?: string;
  onDone?: () => void;
}) {
  const t = useTranslations("profile");
  const router = useRouter();
  return (
    <ProfileForm
      {...props}
      submitLabel={t("save")}
      onSaved={() => {
        onDone?.();
        if (back) router.replace(back, { scroll: true });
        router.refresh();
      }}
    />
  );
}

"use client";
import { Globe, Lock, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EditProfile } from "@/components/profile/edit-profile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ProfileValue } from "@/components/profile/profile-form";
import { ProfileVisibility } from "./profile-visibility";

/**
 * "Edit profile" on the profile itself (like Instagram): photo, name, username,
 * public / private and the bio — without going to Settings.
 */
export function ProfileEditor({
  userId,
  storage,
  initial,
  profilePublic,
  bio,
}: {
  userId: string;
  storage: boolean;
  initial: ProfileValue;
  profilePublic: boolean;
  bio: string | null;
}) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex flex-col items-start gap-2 sm:items-end", open && "basis-full")}>
      <div className="flex flex-wrap gap-2">
        <span className="bg-surface-2 text-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
          {profilePublic ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
          {profilePublic ? t("publicBadge") : t("privateBadge")}
        </span>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <X /> : <Pencil />} {open ? t("closeEdit") : t("editProfile")}
        </Button>
      </div>
      {open && (
        <div className="bg-surface-2/50 mt-2 flex w-full flex-col gap-6 rounded-xl p-5 text-left">
          <EditProfile userId={userId} storage={storage} initial={initial} />
          <div className="border-border border-t pt-5">
            <h3 className="mb-3 text-sm font-semibold">{t("visibilityTitle")}</h3>
            <ProfileVisibility initial={profilePublic} bio={bio} username={null} />
          </div>
        </div>
      )}
    </div>
  );
}

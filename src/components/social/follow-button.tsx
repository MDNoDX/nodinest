"use client";
import { UserCheck, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { followAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

export function FollowButton({
  userId,
  initial,
  size,
}: {
  userId: string;
  initial: boolean;
  size?: "sm" | "md";
}) {
  const t = useTranslations("social");
  const [on, setOn] = useState(initial);
  const { pending, exec } = useAction();
  return (
    <Button
      variant={on ? "outline" : "primary"}
      size={size}
      loading={pending}
      onClick={() => exec(() => followAction(userId, !on), { onSuccess: () => setOn(!on) })}
    >
      {on ? <UserCheck /> : <UserPlus />} {on ? t("following") : t("follow")}
    </Button>
  );
}

"use client";
import { Clock, UserCheck, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { followAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

export function FollowButton({
  userId,
  initial,
  requested = false,
  locked = false,
  size,
}: {
  userId: string;
  initial: boolean;
  /** A request is already waiting for the owner's answer. */
  requested?: boolean;
  /** A private profile: the button asks instead of following. */
  locked?: boolean;
  size?: "sm" | "md";
}) {
  const t = useTranslations("social");
  const [state, setState] = useState(initial ? "following" : requested ? "requested" : "none");
  const { pending, exec } = useAction();
  const on = state !== "none";
  return (
    <Button
      variant={on ? "outline" : "primary"}
      size={size}
      loading={pending}
      title={state === "requested" ? t("requestedHint") : undefined}
      onClick={() =>
        exec(() => followAction(userId, !on), {
          onSuccess: (s) => {
            setState(s);
            if (s === "requested") toast(t("requestSent"));
          },
        })
      }
    >
      {state === "following" ? <UserCheck /> : state === "requested" ? <Clock /> : <UserPlus />}{" "}
      {state === "following"
        ? t("following")
        : state === "requested"
          ? t("requested")
          : locked
            ? t("askToFollow")
            : t("follow")}
    </Button>
  );
}

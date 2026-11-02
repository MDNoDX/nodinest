"use client";
import { Globe, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setSharedAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

/** Private by default; the terms say who answers for sharing a book read aloud. */
export function ShareSwitch({
  resourceId,
  what,
  initial,
}: {
  resourceId: string;
  what: "writeup" | "audiobook";
  initial: boolean;
}) {
  const t = useTranslations("social");
  const [on, setOn] = useState(initial);
  const { pending, exec } = useAction();
  const set = (next: boolean) => {
    exec(() => setSharedAction(resourceId, what, next), {
      onSuccess: () => setOn(next),
      success: t(next ? "sharedOn" : "sharedOff"),
    });
  };
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        aria-pressed={on}
        title={t(what === "audiobook" ? "shareAudiobookHint" : "shareWriteupHint")}
        onClick={() => set(!on)}
      >
        {on ? <Globe /> : <Lock />} {t(on ? "public" : "private")}
      </Button>
    </>
  );
}

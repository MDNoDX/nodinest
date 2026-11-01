"use client";
import { Globe, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setSharedAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAction } from "@/lib/use-action";

/** Private by default. An audiobook asks first: it is someone's book read aloud. */
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
  const tc = useTranslations("common");
  const [on, setOn] = useState(initial);
  const [asking, setAsking] = useState(false);
  const { pending, exec } = useAction();
  const set = (next: boolean) => {
    setAsking(false);
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
        onClick={() => (on ? set(false) : what === "audiobook" ? setAsking(true) : set(true))}
      >
        {on ? <Globe /> : <Lock />} {t(on ? "public" : "private")}
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent title={t("shareAudiobookTitle")} closeLabel={tc("close")}>
          <p className="text-muted text-sm">{t("shareAudiobookWarn")}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => set(true)}>{t("shareAudiobookYes")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

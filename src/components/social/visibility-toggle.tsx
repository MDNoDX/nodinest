"use client";
import { AudioLines, BookOpenText, Globe, Lock, NotebookPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { setItemVisibilityAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";

type Extras = { writeup: boolean | null; audiobook: boolean | null; text: boolean | null };

/**
 * On a library item: show it on my public profile, or keep it private. A
 * switch that flips at once (the server is told in the background; on an
 * error it flips back). When the item has a write-up or an audiobook, opening
 * asks first which of them to show too (both unticked unless shown already).
 */
export function VisibilityToggle({
  resourceId,
  initial,
  profilePublic,
  extras,
}: {
  resourceId: string;
  initial: boolean;
  profilePublic: boolean;
  extras?: Extras;
}) {
  const t = useTranslations("social");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [pub, setPub] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [withWriteup, setWithWriteup] = useState(!!extras?.writeup);
  const [withAudio, setWithAudio] = useState(!!extras?.audiobook);
  const [withText, setWithText] = useState(!!extras?.text);
  // Only the last click counts when someone taps quickly several times.
  const seq = useRef(0);
  const hasExtras =
    extras && (extras.writeup != null || extras.audiobook != null || extras.text != null);
  const flip = async (chosen?: { writeup?: boolean; audiobook?: boolean; text?: boolean }) => {
    const next = !pub;
    if (next && hasExtras && !chosen) return setAsking(true);
    setAsking(false);
    setPub(next);
    const n = ++seq.current;
    const r = await setItemVisibilityAction(resourceId, next, chosen).catch(() => null);
    if (n !== seq.current) return;
    if (!r?.ok) {
      setPub(!next);
      errorToast(te, r && !r.ok ? r : "INTERNAL");
    } else if (next && !profilePublic) toast(t("profileIsPrivate"));
  };
  const tick = (
    on: boolean,
    set: (v: boolean) => void,
    icon: React.ReactNode,
    label: string,
    hint?: string,
  ) => (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
        on ? "border-primary/50 bg-primary-soft" : "border-border hover:border-border-strong",
      )}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon} {label}
        </span>
        {hint && <span className="text-muted mt-1 block text-xs leading-relaxed">{hint}</span>}
      </span>
    </label>
  );
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={pub}
        onClick={() => void flip()}
        title={
          pub && !profilePublic ? t("profileIsPrivate") : t(pub ? "publicHint" : "privateHint")
        }
        className={cn(
          "group relative inline-flex h-8 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs font-medium transition-colors duration-300",
          pub
            ? "border-[var(--c-emerald)]/40 bg-[var(--c-emerald)]/10 text-[var(--c-emerald)]"
            : "border-border text-muted hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "relative h-6 w-10 rounded-full transition-colors duration-300",
            pub ? "bg-[var(--c-emerald)]" : "bg-surface-2",
          )}
        >
          <span
            className={cn(
              "bg-surface absolute top-0.5 left-0.5 grid size-5 place-items-center rounded-full shadow transition-transform duration-300 ease-out",
              pub && "translate-x-4",
            )}
          >
            {pub ? (
              <Globe className="size-3 text-[var(--c-emerald)]" />
            ) : (
              <Lock className="text-muted size-3" />
            )}
          </span>
        </span>
        <span className="min-w-[3.5rem] text-left">{pub ? t("public") : t("private")}</span>
      </button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent title={t("shareWithTitle")} closeLabel={tc("close")}>
          <p className="text-muted text-sm">{t("shareWithBody")}</p>
          <div className="mt-4 flex flex-col gap-2">
            {extras?.writeup != null &&
              tick(
                withWriteup,
                setWithWriteup,
                <NotebookPen className="size-4" />,
                t("shareWithWriteup"),
              )}
            {extras?.audiobook != null &&
              tick(
                withAudio,
                setWithAudio,
                <AudioLines className="size-4" />,
                t("shareWithAudiobook"),
              )}
            {extras?.text != null &&
              tick(
                withText,
                setWithText,
                <BookOpenText className="size-4" />,
                t("shareWithText"),
                t("shareWithTextHint"),
              )}
          </div>
          <p className="text-muted mt-3 text-xs">
            {t.rich("shareWithTerms", {
              terms: (c) => (
                <a href="/terms" target="_blank" className="text-primary hover:underline">
                  {c}
                </a>
              ),
            })}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={() =>
                void flip({
                  ...(extras?.writeup != null ? { writeup: withWriteup } : {}),
                  ...(extras?.audiobook != null ? { audiobook: withAudio } : {}),
                  ...(extras?.text != null ? { text: withText } : {}),
                })
              }
            >
              <Globe /> {t("shareWithConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

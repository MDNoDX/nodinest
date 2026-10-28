"use client";
import { Globe, Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setProfilePublicAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";

/** Settings: is my profile public (and a short bio). Private hides everything. */
export function ProfileVisibility({
  initial,
  bio: initialBio,
  username,
}: {
  initial: boolean;
  bio: string | null;
  username: string | null;
}) {
  const t = useTranslations("social");
  const [on, setOn] = useState(initial);
  const [bio, setBio] = useState(initialBio ?? "");
  const { pending, exec } = useAction();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => setProfilePublicAction(on, bio || null), { success: t("saved") });
      }}
    >
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
        {[
          [false, Lock, t("privateProfile"), t("privateProfileHint")],
          [true, Globe, t("publicProfile"), t("publicProfileHint")],
        ].map(([v, Icon, title, hint]) => {
          const I = Icon as typeof Lock;
          return (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={on === v}
              onClick={() => setOn(v as boolean)}
              className={
                on === v
                  ? "border-primary bg-primary-soft/50 flex items-start gap-3 rounded-xl border p-3 text-left"
                  : "border-border hover:bg-surface-2 flex items-start gap-3 rounded-xl border p-3 text-left"
              }
            >
              <I className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{title as string}</span>
                <span className="text-muted block text-xs">{hint as string}</span>
              </span>
            </button>
          );
        })}
      </div>
      {on && (
        <Field label={t("bio")} optional>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          )}
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
        {username && (
          <Link
            href={`/u/${username}`}
            className="text-primary text-sm font-medium hover:underline"
          >
            {t("viewProfile")}
          </Link>
        )}
      </div>
    </form>
  );
}

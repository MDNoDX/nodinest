"use client";
import { BookPlus, Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { takeSourceAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

/** Adds a card someone shows to my library (the card only, nothing of theirs). */
export function TakeButton({
  resourceId,
  ownerId,
  mine,
}: {
  resourceId: string;
  ownerId: string;
  mine: boolean;
}) {
  const t = useTranslations("media");
  const [taken, setTaken] = useState(mine);
  const { pending, exec } = useAction();
  if (taken)
    return (
      <Button asChild variant="outline">
        <Link href={`/library/${resourceId}`}>
          <Check /> {t("inLibrary")}
        </Link>
      </Button>
    );
  return (
    <Button
      loading={pending}
      onClick={() =>
        exec(() => takeSourceAction(resourceId, ownerId), {
          onSuccess: () => setTaken(true),
          success: t("taken"),
        })
      }
    >
      <BookPlus /> {t("take")}
    </Button>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { youtubeIdFromUrl } from "@/lib/youtube";

/** Asks for a YouTube link and hands back the video id. */
export function YouTubeDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInsert: (videoId: string) => void;
}) {
  const t = useTranslations("taqriz");
  const [url, setUrl] = useState("");
  const id = youtubeIdFromUrl(url);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setUrl("");
        onOpenChange(v);
      }}
    >
      <DialogContent title={t("addYoutube")} description={t("youtubeHint")} closeLabel={t("close")}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!id) return;
            onInsert(id);
            setUrl("");
            onOpenChange(false);
          }}
        >
          <Input
            autoFocus
            type="url"
            inputMode="url"
            placeholder="https://youtu.be/…"
            value={url}
            aria-invalid={!!url && !id}
            onChange={(e) => setUrl(e.target.value)}
          />
          {url && !id && <p className="text-danger text-xs">{t("youtubeInvalid")}</p>}
          <Button type="submit" disabled={!id} className="self-end">
            {t("insert")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

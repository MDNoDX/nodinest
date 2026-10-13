"use client";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveCollectionAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";

export function CollectionDialog({
  collection,
}: {
  collection?: { id: string; name: string; description: string | null; ranked?: boolean };
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [ranked, setRanked] = useState(collection?.ranked ?? false);
  const { pending, exec } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {collection ? (
          <Button variant="outline" size="sm">
            <Pencil /> {t("common.edit")}
          </Button>
        ) : (
          <Button>
            <Plus /> {t("collections.new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={collection ? t("common.edit") : t("collections.new")}
        closeLabel={t("common.close")}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(() => saveCollectionAction({ name, description, ranked }, collection?.id), {
              success: t("common.saved"),
              onSuccess: () => setOpen(false),
            });
          }}
        >
          <Field label={t("collections.name")}>
            {(p) => (
              <Input
                {...p}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            )}
          </Field>
          <Field label={t("collections.description")} optional>
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={ranked}
              onChange={(e) => setRanked(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span>
              <span className="font-medium">{t("collections.ranked")}</span>
              <span className="text-muted block text-xs">{t("collections.rankedHint")}</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

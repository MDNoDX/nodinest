"use client";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { savePublisherAction } from "@/app/actions/catalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

type P = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  description: string | null;
  websiteUrl: string | null;
};

export function PublisherDialog({ publisher }: { publisher?: P }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [v, setV] = useState({
    name: publisher?.name ?? "",
    city: publisher?.city ?? "",
    country: publisher?.country ?? "",
    websiteUrl: publisher?.websiteUrl ?? "",
    description: publisher?.description ?? "",
  });
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }));
  const { pending, exec } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {publisher ? (
          <Button variant="outline" size="sm">
            <Pencil /> {t("common.edit")}
          </Button>
        ) : (
          <Button>
            <Plus /> {t("publishers.add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={publisher ? t("common.edit") : t("publishers.add")}
        closeLabel={t("common.close")}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            exec(() => savePublisherAction(v, publisher?.id), {
              success: t("common.saved"),
              onSuccess: (id) => {
                setOpen(false);
                if (!publisher) router.push(`/publishers/${id}`);
              },
              onError: (r) => {
                if (r.fieldErrors) setErrors(r.fieldErrors);
              },
            });
          }}
        >
          <Field label={t("publishers.name")} error={errors.name}>
            {(p) => (
              <Input
                {...p}
                required
                autoFocus
                value={v.name}
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("publishers.city")} optional>
              {(p) => <Input {...p} value={v.city} onChange={(e) => set("city", e.target.value)} />}
            </Field>
            <Field label={t("publishers.country")} optional>
              {(p) => (
                <Input {...p} value={v.country} onChange={(e) => set("country", e.target.value)} />
              )}
            </Field>
          </div>
          <Field label={t("publishers.website")} optional error={errors.websiteUrl}>
            {(p) => (
              <Input
                {...p}
                type="url"
                placeholder="https://"
                value={v.websiteUrl}
                onChange={(e) => set("websiteUrl", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("common.description")} optional>
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={v.description}
                onChange={(e) => set("description", e.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={!v.name.trim()}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

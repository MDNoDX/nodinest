"use client";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePersonAction } from "@/app/actions/catalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FlexDateInput } from "@/components/ui/flex-date-input";
import { FileUpload } from "@/components/ui/file-upload";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { TagInput } from "@/components/ui/tag-input";
import type { FieldErrors } from "@/lib/errors";
import { PERSON_ROLES } from "@/lib/validation";

import type { PersonFormValue } from "./person-form-value";

export function PersonForm({
  initial,
  personId,
  canEditDirectly: isAdmin,
  storageEnabled,
  userId,
}: {
  initial: PersonFormValue;
  personId?: string;
  /** New entries and the creator's / admin's own edits apply directly. */
  canEditDirectly: boolean;
  storageEnabled: boolean;
  userId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dups, setDups] = useState<{ id: string; label: string; reason: string }[] | null>(null);
  const [explanation, setExplanation] = useState("");
  const [pending, start] = useTransition();
  const set = <K extends keyof PersonFormValue>(k: K, val: PersonFormValue[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  const submit = (allowDuplicate = false) =>
    start(async () => {
      setErrors({});
      const r = await savePersonAction(
        { ...v, links: v.links.filter((l) => l.url.trim()) },
        { id: personId, allowDuplicate, explanation: explanation || null },
      );
      if (r.ok) {
        setDups(null);
        if (r.data.mode === "applied") {
          toast.success(t("resource.savedToCatalog"));
          router.push(`/people/${r.data.id}`);
        } else {
          toast.success(t("resource.submittedForReview"));
          router.push("/suggestions");
        }
        router.refresh();
        return;
      }
      if (r.code === "DUPLICATE")
        return setDups(
          (r.details?.candidates as { id: string; label: string; reason: string }[]) ?? [],
        );
      if (r.fieldErrors) setErrors(r.fieldErrors);
      toast.error(t(`errors.${r.code}`));
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t("person.fullName")} error={errors.fullName} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              required
              value={v.fullName}
              onChange={(e) => set("fullName", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("person.aliases")} optional className="sm:col-span-2">
          {(p) => (
            <TagInput
              id={p.id}
              aria-describedby={p["aria-describedby"]}
              value={v.aliases}
              onChange={(a) => set("aliases", a)}
              removeLabel={t("common.remove")}
            />
          )}
        </Field>
        <Field label={t("person.shortDescription")} optional className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              value={v.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("person.birthDate")} optional error={errors.birthDate}>
          {(p) => (
            <FlexDateInput
              id={p.id}
              value={v.birthDate}
              invalid={!!errors.birthDate}
              onChange={(x) => set("birthDate", x)}
              placeholder="1441-02-09"
            />
          )}
        </Field>
        <Field label={t("person.deathDate")} optional error={errors.deathDate}>
          {(p) => (
            <FlexDateInput
              id={p.id}
              value={v.deathDate}
              invalid={!!errors.deathDate}
              onChange={(x) => set("deathDate", x)}
            />
          )}
        </Field>
        <Field label={t("person.nationality")} optional>
          {(p) => (
            <Input
              {...p}
              value={v.nationality}
              onChange={(e) => set("nationality", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("person.activityAreas")} optional>
          {(p) => (
            <Input
              {...p}
              value={v.activityAreas}
              onChange={(e) => set("activityAreas", e.target.value)}
            />
          )}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t("person.roles")}</legend>
          <div className="flex flex-wrap gap-2">
            {PERSON_ROLES.map((r) => {
              const on = v.roles.includes(r);
              return (
                <label
                  key={r}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary-soft text-primary" : "border-border-strong hover:bg-surface-2"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() =>
                      set("roles", on ? v.roles.filter((x) => x !== r) : [...v.roles, r])
                    }
                  />
                  {t(`personRoles.${r}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label={t("person.biography")} optional className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              rows={8}
              value={v.biography}
              onChange={(e) => set("biography", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("person.portraitUrl")} optional error={errors.portraitUrl}>
          {(p) => (
            <Input
              {...p}
              type="url"
              placeholder="https://"
              value={v.portraitUrl}
              onChange={(e) => set("portraitUrl", e.target.value)}
            />
          )}
        </Field>
        <Field label={t("person.website")} optional error={errors.websiteUrl}>
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
        <div className="sm:col-span-2">
          <FileUpload
            purpose="portrait"
            userId={userId}
            enabled={storageEnabled}
            currentFileId={v.portraitFileId}
            onUploaded={(id) => set("portraitFileId", id)}
            onRemoved={() => set("portraitFileId", null)}
            label={t("person.portrait")}
          />
        </div>
        <Field label={t("resource.verification")}>
          {(p) => (
            <Select
              {...p}
              value={v.verification}
              onChange={(e) =>
                set("verification", e.target.value as PersonFormValue["verification"])
              }
            >
              {(["unverified", "verified", "disputed"] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`verification.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">{t("common.links")}</h2>
        <ul className="flex flex-col gap-2">
          {v.links.map((l, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_10rem_auto]">
              <Select
                aria-label={t("common.type")}
                value={l.kind}
                onChange={(e) =>
                  set(
                    "links",
                    v.links.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)),
                  )
                }
              >
                {["source", "reference", "official", "social", "other"].map((k) => (
                  <option key={k} value={k}>
                    {t(`linkKinds.${k}`)}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={t("common.url")}
                type="url"
                placeholder="https://"
                value={l.url}
                aria-invalid={!!errors[`links.${i}.url`] || undefined}
                onChange={(e) =>
                  set(
                    "links",
                    v.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label={t("common.label")}
                placeholder={t("common.label")}
                value={l.label}
                onChange={(e) =>
                  set(
                    "links",
                    v.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("common.remove")}
                onClick={() =>
                  set(
                    "links",
                    v.links.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => set("links", [...v.links, { kind: "source", url: "", label: "" }])}
        >
          <Plus /> {t("resource.addLink")}
        </Button>
      </section>

      {!isAdmin && (
        <section className="card p-5">
          <Field label={t("suggestions.explanation")} optional>
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            )}
          </Field>
        </section>
      )}

      <div className="border-border bg-background/90 sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <p className="text-muted text-xs">
          {isAdmin ? t("resource.newSubtitleAdmin") : t("resource.newSubtitleUser")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("common.save")}
          </Button>
        </div>
      </div>

      <Dialog open={dups !== null} onOpenChange={(o) => !o && setDups(null)}>
        <DialogContent
          title={t("resource.duplicateTitle")}
          description={t("resource.duplicateBody")}
          closeLabel={t("common.close")}
        >
          <ul className="flex flex-col gap-2">
            {(dups ?? []).map((d) => (
              <li key={d.id}>
                <Link
                  href={`/people/${d.id}`}
                  target="_blank"
                  className="border-border hover:bg-surface-2 flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium">{d.label}</span>
                  <Badge tone="warning">{d.reason.replaceAll("_", " ")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDups(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="outline" loading={pending} onClick={() => submit(true)}>
              {t("common.createAnyway")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}

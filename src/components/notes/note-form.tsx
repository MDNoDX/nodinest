"use client";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveNoteAction } from "@/app/actions/personal";
import { mapPerson, mapResource } from "@/components/people/mappers";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import type { FieldErrors } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

export type NoteFormValue = {
  kind: "note" | "quote";
  title: string;
  body: string;
  quoteText: string;
  resource: { id: string; label: string } | null;
  person: { id: string; label: string } | null;
  pageFrom: string;
  pageTo: string;
  location: string;
  timestampSeconds: string;
  visibility: "private" | "public";
  verification: "unverified" | "verified" | "disputed";
  tags: string[];
};

function Picked({
  label,
  onClear,
  clearLabel,
}: {
  label: string;
  onClear: () => void;
  clearLabel: string;
}) {
  return (
    <div className="border-border-strong bg-surface-2 flex h-10 items-center justify-between rounded-lg border px-3 text-sm">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        className="text-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function NoteForm({ initial, noteId }: { initial: NoteFormValue; noteId?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { pending, exec } = useAction();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof NoteFormValue>(k: K, val: NoteFormValue[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const isQuote = v.kind === "quote";

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        exec(
          () =>
            saveNoteAction(
              {
                kind: v.kind,
                title: v.title,
                body: v.body,
                quoteText: v.quoteText,
                resourceId: v.resource?.id ?? null,
                personId: v.person?.id ?? null,
                pageFrom: v.pageFrom,
                pageTo: v.pageTo,
                location: v.location,
                timestampSeconds: v.timestampSeconds,
                visibility: v.visibility,
                verification: v.verification,
                tags: v.tags,
              },
              noteId,
            ),
          {
            success: t("common.saved"),
            onSuccess: (id) => router.push(`/notes/${id}`),
            onError: (r) => {
              if (r.fieldErrors) setErrors(r.fieldErrors);
            },
          },
        );
      }}
    >
      <section className="card flex flex-col gap-4 p-5">
        <div
          role="radiogroup"
          aria-label={t("notes.kind")}
          className="bg-surface-2 inline-flex w-fit rounded-lg p-1"
        >
          {(["note", "quote"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={v.kind === k}
              onClick={() => set("kind", k)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${v.kind === k ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {k === "note" ? t("notes.kindNote") : t("notes.kindQuote")}
            </button>
          ))}
        </div>
        {isQuote && (
          <Field label={t("notes.quoteText")} hint={t("notes.quoteHint")} error={errors.quoteText}>
            {(p) => (
              <Textarea
                {...p}
                rows={4}
                className="font-serif text-base italic"
                value={v.quoteText}
                onChange={(e) => set("quoteText", e.target.value)}
              />
            )}
          </Field>
        )}
        <Field label={t("notes.titleField")} optional>
          {(p) => <Input {...p} value={v.title} onChange={(e) => set("title", e.target.value)} />}
        </Field>
        <Field
          label={isQuote ? t("notes.commentary") : t("notes.body")}
          hint={isQuote ? t("notes.commentaryHint") : undefined}
          optional={isQuote}
          error={errors.body}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={isQuote ? 4 : 10}
              value={v.body}
              onChange={(e) => set("body", e.target.value)}
            />
          )}
        </Field>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t("notes.resource")} optional className="sm:col-span-2">
          {(p) =>
            v.resource ? (
              <Picked
                label={v.resource.label}
                onClear={() => set("resource", null)}
                clearLabel={t("common.remove")}
              />
            ) : (
              <Combobox
                id={p.id}
                endpoint="/api/autocomplete/resources"
                mapItem={mapResource}
                placeholder={t("notes.resourcePlaceholder")}
                onPick={(o) => set("resource", { id: o.id, label: o.label })}
              />
            )
          }
        </Field>
        {isQuote && (
          <Field
            label={t("notes.person")}
            optional
            hint={t("notes.personHint")}
            className="sm:col-span-2"
          >
            {(p) =>
              v.person ? (
                <Picked
                  label={v.person.label}
                  onClear={() => set("person", null)}
                  clearLabel={t("common.remove")}
                />
              ) : (
                <Combobox
                  id={p.id}
                  aria-describedby={p["aria-describedby"]}
                  endpoint="/api/autocomplete/people"
                  mapItem={mapPerson}
                  placeholder={t("resource.contributorPlaceholder")}
                  onPick={(o) => set("person", { id: o.id, label: o.label })}
                />
              )
            }
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("notes.pageFrom")} optional>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                value={v.pageFrom}
                onChange={(e) => set("pageFrom", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("notes.pageTo")} optional error={errors.pageTo}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                value={v.pageTo}
                onChange={(e) => set("pageTo", e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t("notes.location")} optional>
          {(p) => (
            <Input {...p} value={v.location} onChange={(e) => set("location", e.target.value)} />
          )}
        </Field>
        <Field
          label={t("common.tags")}
          optional
          hint={t("resource.tagsHint")}
          className="sm:col-span-2"
        >
          {(p) => (
            <TagInput
              id={p.id}
              aria-describedby={p["aria-describedby"]}
              value={v.tags}
              onChange={(tags) => set("tags", tags)}
              removeLabel={t("common.remove")}
            />
          )}
        </Field>
        <Field label={t("common.visibility")} hint={t("notes.visibilityHint")}>
          {(p) => (
            <Select
              {...p}
              value={v.visibility}
              onChange={(e) => set("visibility", e.target.value as NoteFormValue["visibility"])}
            >
              <option value="private">{t("common.private")}</option>
              <option value="public">{t("common.public")}</option>
            </Select>
          )}
        </Field>
        {isQuote && (
          <Field label={t("notes.verification")}>
            {(p) => (
              <Select
                {...p}
                value={v.verification}
                onChange={(e) =>
                  set("verification", e.target.value as NoteFormValue["verification"])
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
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

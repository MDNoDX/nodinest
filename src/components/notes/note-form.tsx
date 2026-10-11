"use client";
import { FileText, Quote, X } from "lucide-react";
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
import { cn } from "@/lib/cn";
import { hueStyle } from "@/lib/hues";

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
      <div role="radiogroup" aria-label={t("notes.kind")} className="grid grid-cols-2 gap-3">
        {(
          [
            ["note", FileText, "teal", t("notes.kindNote"), t("notes.kindNoteHint")],
            ["quote", Quote, "violet", t("notes.kindQuote"), t("notes.kindQuoteHint")],
          ] as const
        ).map(([k, Icon, hue, label, hint]) => {
          const on = v.kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set("kind", k)}
              style={hueStyle(hue)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 text-left transition-all",
                on
                  ? "hue-soft hue-border shadow-sm ring-2 ring-[var(--hue)]/35"
                  : "border-border bg-surface hover:-translate-y-0.5 hover:shadow-sm",
              )}
            >
              <span className="chip grid size-10 shrink-0 place-items-center rounded-xl">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className="text-muted block text-xs">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section
        className="card relative flex flex-col gap-4 overflow-hidden p-5 sm:p-6"
        style={hueStyle(isQuote ? "violet" : "teal")}
      >
        <span aria-hidden className="hue-bar absolute inset-x-0 top-0 h-1" />
        {isQuote && (
          <Field label={t("notes.quoteText")} hint={t("notes.quoteHint")} error={errors.quoteText}>
            {(p) => (
              <Textarea
                {...p}
                rows={4}
                className="hue-soft border-l-4 border-l-[var(--hue)] font-serif text-lg leading-relaxed italic"
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

      <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
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

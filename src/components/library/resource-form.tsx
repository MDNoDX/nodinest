"use client";
import { Download, Link2, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importUrlAction, saveResourceAction } from "@/app/actions/catalog";
import { mapPerson } from "@/components/people/mappers";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { TagInput } from "@/components/ui/tag-input";
import { FileUpload } from "@/components/ui/file-upload";
import type { FieldErrors } from "@/lib/errors";
import {
  BOOK_LIKE,
  CONTRIBUTOR_ROLES,
  MEDIA_LIKE,
  RESOURCE_TYPES,
  type ResourceType,
} from "@/lib/validation";

import type { ResourceFormValue } from "./resource-form-value";

type Contributor = ResourceFormValue["contributors"][number];

function toPayload(v: ResourceFormValue) {
  const isBook = BOOK_LIKE.includes(v.type);
  const isMedia = MEDIA_LIKE.includes(v.type);
  return {
    type: v.type,
    title: v.title,
    originalTitle: v.originalTitle,
    description: v.description,
    coverUrl: v.coverUrl,
    coverFileId: v.coverFileId,
    language: v.language,
    publicationDate: v.publicationDate,
    sourceUrl: v.sourceUrl,
    sourceNote: v.sourceNote,
    verification: v.verification,
    contributors: v.contributors.map((c) => ({
      personId: c.personId,
      newPersonName: c.newPersonName,
      role: c.role,
    })),
    categoryIds: v.categoryIds,
    tags: v.tags,
    identifiers: v.identifiers.filter((i) => i.value.trim()),
    links: v.links
      .filter((l) => l.url.trim())
      .map((l) => ({ kind: l.kind, url: l.url, label: l.label })),
    book: isBook ? { ...v.book, pageCount: v.book.pageCount } : null,
    media: isMedia
      ? {
          platform: v.media.platform,
          channel: v.media.channel,
          durationSeconds: v.media.durationMinutes
            ? Math.round(Number(v.media.durationMinutes) * 60)
            : null,
          transcript: v.media.transcript,
          transcriptUrl: v.media.transcriptUrl,
        }
      : null,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-semibold tracking-tight">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ResourceForm({
  initial,
  resourceId,
  categories,
  isAdmin,
  storageEnabled,
  locale,
}: {
  initial: ResourceFormValue;
  resourceId?: string;
  categories: { id: string; nameUz: string; nameEn: string; parentId: string | null }[];
  isAdmin: boolean;
  storageEnabled: boolean;
  locale: "uz" | "en";
}) {
  const t = useTranslations();
  const router = useRouter();
  const [v, setV] = useState<ResourceFormValue>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dups, setDups] = useState<{ id: string; label: string; reason: string }[] | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [pending, start] = useTransition();
  const [importing, startImport] = useTransition();
  const set = <K extends keyof ResourceFormValue>(k: K, val: ResourceFormValue[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];
  const isBook = BOOK_LIKE.includes(v.type);
  const isMedia = MEDIA_LIKE.includes(v.type);

  const submit = (allowDuplicate = false) =>
    start(async () => {
      setErrors({});
      const r = await saveResourceAction(toPayload(v), {
        id: resourceId,
        allowDuplicate,
        explanation: explanation || null,
      });
      if (r.ok) {
        setDups(null);
        if (r.data.mode === "applied") {
          toast.success(t("resource.savedToCatalog"));
          router.push(`/library/${r.data.id}`);
        } else {
          toast.success(t("resource.submittedForReview"));
          router.push("/suggestions");
        }
        router.refresh();
        return;
      }
      if (r.code === "DUPLICATE") {
        setDups((r.details?.candidates as { id: string; label: string; reason: string }[]) ?? []);
        return;
      }
      if (r.fieldErrors) setErrors(r.fieldErrors);
      toast.error(t(`errors.${r.code}`));
    });

  const runImport = () =>
    startImport(async () => {
      const r = await importUrlAction(importUrl);
      if (!r.ok) {
        toast.error(t(`errors.${r.code}`));
        return;
      }
      const m = r.data;
      setV((s) => {
        const type: ResourceType =
          m.suggestedType === "video"
            ? s.type === "lecture" || s.type === "interview"
              ? s.type
              : "video"
            : m.suggestedType === "book"
              ? "book"
              : m.suggestedType === "article"
                ? "article"
                : s.type;
        const contributors = [...s.contributors];
        const name = m.author ?? null;
        if (name && !contributors.some((c) => c.label === name))
          contributors.push({
            personId: null,
            newPersonName: name,
            role: type === "book" || type === "article" ? "author" : "speaker",
            label: name,
          });
        const identifiers = [...s.identifiers];
        if (m.youtubeId && !identifiers.some((i) => i.scheme === "youtube"))
          identifiers.push({ scheme: "youtube", value: m.youtubeId });
        if (m.isbn && !identifiers.some((i) => i.scheme.startsWith("isbn")))
          identifiers.push({
            scheme: m.isbn.replace(/[^\dX]/gi, "").length === 10 ? "isbn10" : "isbn13",
            value: m.isbn,
          });
        return {
          ...s,
          type,
          title: s.title || m.title || "",
          description: s.description || m.description || "",
          coverUrl: s.coverUrl || m.image || "",
          sourceUrl: m.url,
          publicationDate: s.publicationDate || m.publishedDate || "",
          contributors,
          identifiers,
          media: {
            ...s.media,
            platform: s.media.platform || (m.kind === "youtube" ? "YouTube" : m.siteName || ""),
            channel: s.media.channel || m.channel || "",
            durationMinutes:
              s.media.durationMinutes ||
              (m.durationSeconds ? String(Math.round(m.durationSeconds / 60)) : ""),
          },
          sourceNote:
            s.sourceNote ||
            `${m.siteName ?? new URL(m.url).hostname} — ${new Date(m.fetchedAt).toISOString().slice(0, 10)}`,
        };
      });
      toast.success(t("resource.imported"));
    });

  const catName = (c: { nameUz: string; nameEn: string }) =>
    locale === "uz" ? c.nameUz : c.nameEn;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      noValidate
    >
      <section className="card flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="text-muted size-4" /> {t("resource.importFromUrl")}
        </div>
        <p className="text-muted text-xs">{t("resource.importHint")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://"
            aria-label={t("common.url")}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={runImport}
            loading={importing}
            disabled={!importUrl.trim()}
          >
            <Download /> {importing ? t("resource.importing") : t("resource.importButton")}
          </Button>
        </div>
      </section>

      <Section title={t("resource.basics")}>
        <Field label={t("resource.type")}>
          {(p) => (
            <Select
              {...p}
              value={v.type}
              onChange={(e) => set("type", e.target.value as ResourceType)}
            >
              {RESOURCE_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`types.${ty}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("resource.language")} optional>
          {(p) => (
            <Input
              {...p}
              value={v.language}
              onChange={(e) => set("language", e.target.value)}
              placeholder="uz, en, ru…"
            />
          )}
        </Field>
        <Field label={t("resource.titleField")} error={err("title")} className="sm:col-span-2">
          {(p) => (
            <Input {...p} required value={v.title} onChange={(e) => set("title", e.target.value)} />
          )}
        </Field>
        <Field label={t("resource.originalTitle")} optional className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              value={v.originalTitle}
              onChange={(e) => set("originalTitle", e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t("resource.description")}
          optional
          error={err("description")}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              {...p}
              rows={5}
              value={v.description}
              onChange={(e) => set("description", e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t("resource.publicationDate")}
          optional
          hint={t("resource.partialDateHint")}
          error={err("publicationDate")}
        >
          {(p) => (
            <Input
              {...p}
              value={v.publicationDate}
              onChange={(e) => set("publicationDate", e.target.value)}
              placeholder="2011"
              inputMode="numeric"
            />
          )}
        </Field>
        <Field label={t("resource.coverUrl")} optional error={err("coverUrl")}>
          {(p) => (
            <Input
              {...p}
              type="url"
              value={v.coverUrl}
              onChange={(e) => set("coverUrl", e.target.value)}
              placeholder="https://"
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <FileUpload
            purpose="cover"
            enabled={storageEnabled}
            currentFileId={v.coverFileId}
            onUploaded={(id) => set("coverFileId", id)}
            onRemoved={() => set("coverFileId", null)}
            label={t("resource.cover")}
          />
        </div>
      </Section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold tracking-tight">{t("resource.contributors")}</h2>
        {err("contributors") && (
          <p className="text-danger mb-2 text-xs">{t("validation.contributor_person_or_name")}</p>
        )}
        <ul className="my-3 flex flex-col gap-2">
          {v.contributors.map((c, i) => (
            <li
              key={`${c.personId ?? c.newPersonName}-${i}`}
              className="border-border flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {c.label}{" "}
                {!c.personId && <Badge tone="accent">{t("resource.newPersonBadge")}</Badge>}
              </span>
              <Select
                aria-label={t("contributorRoles.other")}
                className="h-8 w-40"
                value={c.role}
                onChange={(e) =>
                  set(
                    "contributors",
                    v.contributors.map((x, j) =>
                      j === i ? { ...x, role: e.target.value as Contributor["role"] } : x,
                    ),
                  )
                }
              >
                {CONTRIBUTOR_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`contributorRoles.${r}`)}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("common.remove")} ${c.label}`}
                onClick={() =>
                  set(
                    "contributors",
                    v.contributors.filter((_, j) => j !== i),
                  )
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
        <Combobox
          endpoint="/api/autocomplete/people"
          mapItem={mapPerson}
          placeholder={t("resource.contributorPlaceholder")}
          ariaLabel={t("resource.addContributor")}
          createLabel={(q) => t("resource.createPerson", { name: q })}
          onPick={(o) => {
            const role: Contributor["role"] =
              isBook || v.type === "article"
                ? "author"
                : v.type === "course"
                  ? "instructor"
                  : "speaker";
            if (o.create)
              set("contributors", [
                ...v.contributors,
                { personId: null, newPersonName: o.label, role, label: o.label },
              ]);
            else if (!v.contributors.some((c) => c.personId === o.id))
              set("contributors", [
                ...v.contributors,
                { personId: o.id, newPersonName: null, role, label: o.label },
              ]);
          }}
        />
      </section>

      {isBook && (
        <Section title={t("resource.details")}>
          <Field label={t("resource.publisher")} optional>
            {(p) => (
              <Input
                {...p}
                value={v.book.publisher}
                onChange={(e) => set("book", { ...v.book, publisher: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("resource.edition")} optional>
            {(p) => (
              <Input
                {...p}
                value={v.book.edition}
                onChange={(e) => set("book", { ...v.book, edition: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("resource.pageCount")} optional error={err("book.pageCount")}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                value={v.book.pageCount}
                onChange={(e) => set("book", { ...v.book, pageCount: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("resource.originalLanguage")} optional>
            {(p) => (
              <Input
                {...p}
                value={v.book.originalLanguage}
                onChange={(e) => set("book", { ...v.book, originalLanguage: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("resource.readingUrl")} optional error={err("book.readingUrl")}>
            {(p) => (
              <Input
                {...p}
                type="url"
                value={v.book.readingUrl}
                onChange={(e) => set("book", { ...v.book, readingUrl: e.target.value })}
                placeholder="https://"
              />
            )}
          </Field>
          <Field label={t("resource.purchaseUrl")} optional error={err("book.purchaseUrl")}>
            {(p) => (
              <Input
                {...p}
                type="url"
                value={v.book.purchaseUrl}
                onChange={(e) => set("book", { ...v.book, purchaseUrl: e.target.value })}
                placeholder="https://"
              />
            )}
          </Field>
          <Field label={t("resource.fileFormat")} optional>
            {(p) => (
              <Input
                {...p}
                value={v.book.fileFormat}
                onChange={(e) => set("book", { ...v.book, fileFormat: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("resource.toc")} optional className="sm:col-span-2">
            {(p) => (
              <Textarea
                {...p}
                rows={5}
                value={v.book.tableOfContents}
                onChange={(e) => set("book", { ...v.book, tableOfContents: e.target.value })}
              />
            )}
          </Field>
        </Section>
      )}

      {isMedia && (
        <Section title={t("resource.details")}>
          <Field label={t("resource.platform")} optional>
            {(p) => (
              <Input
                {...p}
                value={v.media.platform}
                onChange={(e) => set("media", { ...v.media, platform: e.target.value })}
                placeholder="YouTube"
              />
            )}
          </Field>
          <Field label={t("resource.channel")} optional>
            {(p) => (
              <Input
                {...p}
                value={v.media.channel}
                onChange={(e) => set("media", { ...v.media, channel: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("resource.duration")} optional error={err("media.durationSeconds")}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                step="1"
                value={v.media.durationMinutes}
                onChange={(e) => set("media", { ...v.media, durationMinutes: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("resource.transcriptUrl")} optional error={err("media.transcriptUrl")}>
            {(p) => (
              <Input
                {...p}
                type="url"
                value={v.media.transcriptUrl}
                onChange={(e) => set("media", { ...v.media, transcriptUrl: e.target.value })}
                placeholder="https://"
              />
            )}
          </Field>
          <Field label={t("resource.transcript")} optional className="sm:col-span-2">
            {(p) => (
              <Textarea
                {...p}
                rows={6}
                value={v.media.transcript}
                onChange={(e) => set("media", { ...v.media, transcript: e.target.value })}
              />
            )}
          </Field>
        </Section>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold tracking-tight">
          {t("resource.classification")}
        </h2>
        {categories.length > 0 && (
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium">{t("resource.categories")}</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = v.categoryIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors ${on ? "border-primary bg-primary-soft text-primary" : "border-border-strong hover:bg-surface-2"}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() =>
                        set(
                          "categoryIds",
                          on ? v.categoryIds.filter((x) => x !== c.id) : [...v.categoryIds, c.id],
                        )
                      }
                    />
                    {catName(c)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <Field label={t("common.tags")} optional hint={t("resource.tagsHint")}>
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
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold tracking-tight">
          {t("resource.sourcesSection")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("resource.sourceUrl")} optional error={err("sourceUrl")}>
            {(p) => (
              <Input
                {...p}
                type="url"
                value={v.sourceUrl}
                onChange={(e) => set("sourceUrl", e.target.value)}
                placeholder="https://"
              />
            )}
          </Field>
          <Field label={t("resource.verification")}>
            {(p) => (
              <Select
                {...p}
                value={v.verification}
                onChange={(e) =>
                  set("verification", e.target.value as ResourceFormValue["verification"])
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
          <Field label={t("resource.sourceNote")} optional className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                value={v.sourceNote}
                onChange={(e) => set("sourceNote", e.target.value)}
              />
            )}
          </Field>
        </div>

        <h3 className="mt-6 mb-2 text-sm font-medium">{t("resource.identifiers")}</h3>
        {err("identifiers") && (
          <p className="text-danger mb-2 text-xs">{t("validation.invalid_isbn")}</p>
        )}
        <ul className="flex flex-col gap-2">
          {v.identifiers.map((id, i) => (
            <li key={i} className="flex gap-2">
              <Select
                aria-label={t("common.type")}
                className="w-36"
                value={id.scheme}
                onChange={(e) =>
                  set(
                    "identifiers",
                    v.identifiers.map((x, j) => (j === i ? { ...x, scheme: e.target.value } : x)),
                  )
                }
              >
                {["isbn13", "isbn10", "doi", "youtube", "wikidata", "openlibrary", "other"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ),
                )}
              </Select>
              <Input
                aria-label={t("resource.identifiers")}
                value={id.value}
                onChange={(e) =>
                  set(
                    "identifiers",
                    v.identifiers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
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
                    "identifiers",
                    v.identifiers.filter((_, j) => j !== i),
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
          onClick={() => set("identifiers", [...v.identifiers, { scheme: "isbn13", value: "" }])}
        >
          <Plus /> {t("resource.addIdentifier")}
        </Button>

        <h3 className="mt-6 mb-2 text-sm font-medium">{t("resource.linksSection")}</h3>
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
                {["source", "reference", "official", "read", "purchase", "social", "other"].map(
                  (k) => (
                    <option key={k} value={k}>
                      {t(`linkKinds.${k}`)}
                    </option>
                  ),
                )}
              </Select>
              <Input
                aria-label={t("common.url")}
                type="url"
                placeholder="https://"
                value={l.url}
                aria-invalid={!!err(`links.${i}.url`) || undefined}
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
          onClick={() => set("links", [...v.links, { kind: "reference", url: "", label: "" }])}
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
            {pending ? t("common.saving") : t("common.save")}
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
                  href={`/library/${d.id}`}
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

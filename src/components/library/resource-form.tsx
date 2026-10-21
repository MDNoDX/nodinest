"use client";
/* eslint-disable @next/next/no-img-element */
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  FileText,
  Film,
  Globe,
  GraduationCap,
  Headphones,
  Image as ImageIcon,
  Link2,
  Loader2,
  Mic,
  Plus,
  Presentation,
  Search,
  Shapes,
  Tags,
  Timer,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importUrlAction, lookupBooksAction, saveResourceAction } from "@/app/actions/catalog";
import { mapPerson, mapPublisher } from "@/components/people/mappers";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { DurationInput } from "@/components/ui/duration-input";
import { FlexDateInput } from "@/components/ui/flex-date-input";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge, IconChip } from "@/components/ui/misc";
import { TagInput } from "@/components/ui/tag-input";
import { cn } from "@/lib/cn";
import type { FieldErrors } from "@/lib/errors";
import { hueFor, hueStyle, TYPE_HUE, type Hue } from "@/lib/hues";
import { youtubeIdFromUrl } from "@/lib/youtube";
import {
  BOOK_LIKE,
  CONTRIBUTOR_ROLES,
  MEDIA_LIKE,
  RESOURCE_TYPES,
  type ResourceType,
} from "@/lib/validation";
import type { Contributor, ResourceFormValue } from "./resource-form-value";

const TYPE_ICONS: Record<ResourceType, LucideIcon> = {
  book: BookOpen,
  course: GraduationCap,
  video: Film,
  lecture: Presentation,
  interview: Mic,
  article: FileText,
  podcast: Headphones,
  other: Shapes,
};

type Candidate = {
  title: string;
  subtitle: string | null;
  authors: string[];
  editionDate: string | null;
  originalYear: string | null;
  publisher: string | null;
  pageCount: number | null;
  language: string | null;
  isbn13: string | null;
  isbn10: string | null;
  description: string | null;
  coverUrl: string | null;
  infoUrl: string | null;
};

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)coursera\.org$/, "Coursera"],
  [/(^|\.)udemy\.com$/, "Udemy"],
  [/(^|\.)edx\.org$/, "edX"],
  [/(^|\.)khanacademy\.org$/, "Khan Academy"],
  [/(^|\.)stepik\.org$/, "Stepik"],
  [/(^|\.)spotify\.com$/, "Spotify"],
  [/(^|\.)podcasts\.apple\.com$/, "Apple Podcasts"],
  [/(^|\.)vimeo\.com$/, "Vimeo"],
  [/(^|\.)t\.me$/, "Telegram"],
];
/** Platform name from a link (shown as the "where" when nothing was typed). */
function platformOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? "";
  } catch {
    return "";
  }
}

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
    originalDate: v.originalDate,
    publicationDate: v.publicationDate,
    sourceUrl: v.sourceUrl,
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
    book: isBook
      ? {
          publisherId: v.book.publisherId,
          publisherName: v.book.publisherId ? null : v.book.publisherName,
          pageCount: v.book.pageCount,
          originalLanguage: v.book.originalLanguage,
          readingUrl: v.book.readingUrl,
        }
      : null,
    media: isMedia
      ? {
          platform: v.media.platform || platformOf(v.sourceUrl),
          channel: v.media.channel,
          durationSeconds: Number(v.media.durationSeconds) || null,
          lessonCount: v.type === "course" ? v.media.lessonCount : null,
          transcript: v.media.transcript,
          transcriptUrl: v.media.transcriptUrl,
        }
      : null,
  };
}

function SectionTitle({
  title,
  icon,
  hue,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  hue: Hue;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center gap-2.5", className)}>
      <IconChip icon={icon} hue={hue} />
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

export function ResourceForm({
  initial,
  resourceId,
  categories,
  isAdmin,
  canEditDirectly,
  storageEnabled,
  locale,
  userId,
}: {
  initial: ResourceFormValue;
  resourceId?: string;
  categories: { id: string; nameUz: string; nameEn: string; parentId: string | null }[];
  isAdmin: boolean;
  /** True when saving applies immediately (new entry, own entry or admin mode). */
  canEditDirectly: boolean;
  storageEnabled: boolean;
  locale: "uz" | "en";
  userId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [v, setV] = useState<ResourceFormValue>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dups, setDups] = useState<{ id: string; label: string; reason: string }[] | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [explanation, setExplanation] = useState("");
  const [pending, start] = useTransition();
  const [finding, startFind] = useTransition();
  const set = <K extends keyof ResourceFormValue>(k: K, val: ResourceFormValue[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];
  const isBook = BOOK_LIKE.includes(v.type);
  const isMedia = MEDIA_LIKE.includes(v.type);
  // A YouTube id from the identifiers, the source URL or a link: its length can be read.
  const ytId =
    v.identifiers
      .filter((i) => i.scheme === "youtube")
      .map((i) => youtubeIdFromUrl(i.value))
      .find(Boolean) ??
    [v.sourceUrl, ...v.links.map((l) => l.url)].map(youtubeIdFromUrl).find(Boolean) ??
    null;
  const [detecting, startDetect] = useTransition();
  const detectDuration = (id: string, loud: boolean) =>
    startDetect(async () => {
      const r = await importUrlAction(`https://www.youtube.com/watch?v=${id}`);
      const secs = r.ok ? r.data.durationSeconds : null;
      if (secs) {
        setV((s) => ({ ...s, media: { ...s.media, durationSeconds: String(secs) } }));
        if (loud) toast.success(t("resource.durationDetected"));
      } else if (loud) toast.error(r.ok ? t("resource.durationUnknown") : t(`errors.${r.code}`));
    });
  const coverPreview = v.coverFileId ? `/api/files/${v.coverFileId}` : v.coverUrl || null;

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

  /** One box: a URL imports page metadata; anything else searches books online. */
  const find = () =>
    startFind(async () => {
      const q = query.trim();
      if (!q) return;
      if (/^https?:\/\//i.test(q)) {
        const r = await importUrlAction(q);
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
          if (m.author && !contributors.some((c) => c.label === m.author))
            contributors.push({
              personId: null,
              newPersonName: m.author,
              role: type === "book" || type === "article" ? "author" : "speaker",
              label: m.author,
            });
          const identifiers = [...s.identifiers];
          if (m.youtubeId && !identifiers.some((i) => i.scheme === "youtube"))
            identifiers.push({ scheme: "youtube", value: m.youtubeId });
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
              durationSeconds:
                s.media.durationSeconds || (m.durationSeconds ? String(m.durationSeconds) : ""),
            },
          };
        });
        toast.success(t("resource.imported"));
        return;
      }
      const r = await lookupBooksAction(q);
      if (!r.ok) {
        toast.error(t(`errors.${r.code}`));
        return;
      }
      setCandidates(r.data);
    });

  const pick = (c: Candidate) => {
    setV((s) => {
      const contributors = [...s.contributors];
      for (const a of c.authors.slice(0, 5))
        if (!contributors.some((x) => x.label.toLowerCase() === a.toLowerCase()))
          contributors.push({ personId: null, newPersonName: a, role: "author", label: a });
      const identifiers = [...s.identifiers];
      const isbn = c.isbn13 ?? c.isbn10;
      if (isbn && !identifiers.some((i) => i.scheme.startsWith("isbn")))
        identifiers.push({ scheme: c.isbn13 ? "isbn13" : "isbn10", value: isbn });
      return {
        ...s,
        type: "book",
        title: c.title,
        description: s.description || c.description || "",
        coverUrl: c.coverUrl ?? s.coverUrl,
        coverFileId: c.coverUrl ? null : s.coverFileId,
        language: s.language || c.language || "",
        originalDate: s.originalDate || c.originalYear || "",
        publicationDate: s.publicationDate || c.editionDate || "",
        sourceUrl: s.sourceUrl || c.infoUrl || "",
        contributors,
        identifiers,
        book: {
          ...s.book,
          publisherName:
            s.book.publisherId || s.book.publisherName ? s.book.publisherName : c.publisher || "",
          pageCount: s.book.pageCount || (c.pageCount ? String(c.pageCount) : ""),
        },
      };
    });
    setCandidates(null);
    toast.success(t("resource.imported"));
  };

  const DetailsIcon = TYPE_ICONS[v.type];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      noValidate
    >
      {/* 1. Type */}
      <fieldset className="card p-5 sm:p-6">
        <legend className="sr-only">{t("resource.type")}</legend>
        <div className="mb-4 text-[15px] font-semibold tracking-tight">
          {t("resource.whatType")}
        </div>
        <div
          role="radiogroup"
          aria-label={t("resource.type")}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
        >
          {RESOURCE_TYPES.map((ty) => {
            const Icon = TYPE_ICONS[ty];
            const on = v.type === ty;
            return (
              <button
                key={ty}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("type", ty)}
                style={hueStyle(TYPE_HUE[ty])}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-all",
                  on
                    ? "hue-soft hue-border shadow-sm ring-2 ring-[var(--hue)]/40"
                    : "border-border bg-surface hover:-translate-y-0.5 hover:shadow-sm",
                )}
              >
                <span className="chip grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-[18px]" />
                </span>
                <span className="leading-tight">{t(`types.${ty}`)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 2. Find online */}
      <section
        className="card relative flex flex-col gap-3 overflow-hidden p-5 sm:p-6"
        style={hueStyle("sky")}
      >
        <span aria-hidden className="hue-bar absolute inset-y-0 left-0 w-1" />
        <div className="flex items-center gap-2.5">
          <IconChip icon={<Globe />} hue="sky" />
          <div>
            <div className="text-[15px] font-semibold tracking-tight">
              {t("resource.findOnline")}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                find();
              }
            }}
            placeholder="Sapiens · 9780062316097 · https://…"
            aria-label={t("resource.findOnline")}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={find}
            loading={finding}
            disabled={!query.trim()}
          >
            <Search /> {finding ? t("resource.searchingOnline") : t("resource.findOnline")}
          </Button>
        </div>
        {candidates && (
          <div className="mt-1">
            {candidates.length === 0 ? (
              <p className="text-muted text-sm">{t("resource.noOnlineResults")}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {candidates.map((c, i) => (
                  <li key={`${c.title}-${i}`}>
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      className="border-border bg-surface hover:border-primary flex w-full gap-3 rounded-xl border p-2.5 text-left transition-colors"
                    >
                      {c.coverUrl ? (
                        <img
                          src={c.coverUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-20 w-14 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="bg-surface-2 grid h-20 w-14 shrink-0 place-items-center rounded-md">
                          <BookOpen className="text-muted size-5" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-semibold">{c.title}</span>
                        <span className="text-muted block truncate text-xs">
                          {c.authors.join(", ")}
                        </span>
                        <span className="text-muted block text-xs">
                          {[
                            c.originalYear,
                            c.editionDate && c.editionDate !== c.originalYear
                              ? `(${c.editionDate})`
                              : null,
                            c.pageCount ? `${c.pageCount} b.` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="text-primary mt-1 inline-block text-xs font-semibold">
                          {t("resource.pickResult")} →
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 3. Basics + cover */}
      <section className="card p-5 sm:p-6">
        <SectionTitle title={t("resource.basics")} icon={<FileText />} hue="blue" />
        <div className="grid gap-5 sm:grid-cols-[1fr_11rem]">
          <div className="grid content-start gap-4">
            <Field label={t("resource.titleField")} error={err("title")}>
              {(p) => (
                <Input
                  {...p}
                  required
                  value={v.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              )}
            </Field>
            <Field label={t("resource.originalTitle")} optional>
              {(p) => (
                <Input
                  {...p}
                  value={v.originalTitle}
                  onChange={(e) => set("originalTitle", e.target.value)}
                />
              )}
            </Field>
            <Field label={t("resource.description")} optional error={err("description")}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={5}
                  value={v.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("resource.cover")}</span>
            {coverPreview ? (
              <div className="relative">
                <img
                  src={coverPreview}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="border-border aspect-[2/3] w-full rounded-xl border object-cover shadow-sm"
                />
                <button
                  type="button"
                  aria-label={t("upload.remove")}
                  onClick={() => setV((s) => ({ ...s, coverUrl: "", coverFileId: null }))}
                  className="bg-surface/90 text-foreground absolute top-2 right-2 rounded-full p-1.5 shadow"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <FileUpload
                purpose="cover"
                variant="tile"
                enabled={storageEnabled}
                userId={userId}
                onUploaded={(id) => setV((s) => ({ ...s, coverFileId: id, coverUrl: "" }))}
                label={t("upload.coverUpload")}
              />
            )}
            <label className="text-muted mt-1 flex items-center gap-1.5 text-xs font-medium">
              <Link2 className="size-3.5" /> {t("resource.coverUrl")}
            </label>
            <Input
              type="url"
              value={v.coverUrl}
              onChange={(e) => {
                const url = e.target.value;
                setV((s) => ({ ...s, coverUrl: url, coverFileId: url ? null : s.coverFileId }));
              }}
              placeholder="https://…"
              aria-label={t("resource.coverUrl")}
              aria-invalid={!!err("coverUrl") || undefined}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </section>

      {/* 4. People */}
      <section className="card p-5 sm:p-6">
        <SectionTitle
          title={t("resource.contributors")}
          icon={<Users />}
          hue="orange"
          className="mb-1"
        />
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

      {/* 5. Dates & details — books have their own set; every other type shares one */}
      <section className="card p-5 sm:p-6">
        <SectionTitle title={t("resource.details")} icon={<DetailsIcon />} hue={TYPE_HUE[v.type]} />
        <div className="grid gap-4 sm:grid-cols-2">
          {isBook ? (
            <>
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="text-muted size-3.5" /> {t("resource.originalDate")}
                  </span>
                }
                optional
                hint={t("resource.originalDateHint")}
                error={err("originalDate")}
              >
                {(p) => (
                  <FlexDateInput
                    id={p.id}
                    value={v.originalDate}
                    invalid={!!err("originalDate")}
                    onChange={(x) => set("originalDate", x)}
                  />
                )}
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="text-muted size-3.5" /> {t("resource.editionDate")}
                  </span>
                }
                optional
                hint={t("resource.editionDateHint")}
                error={err("publicationDate")}
              >
                {(p) => (
                  <FlexDateInput
                    id={p.id}
                    value={v.publicationDate}
                    invalid={!!err("publicationDate")}
                    onChange={(x) => set("publicationDate", x)}
                  />
                )}
              </Field>
              <Field label={t("resource.publisher")} optional>
                {(p) =>
                  v.book.publisherId || v.book.publisherName ? (
                    <div className="border-border-strong bg-surface-2 flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Building2 className="text-muted size-4 shrink-0" />
                        <span className="truncate font-medium">{v.book.publisherName}</span>
                        {!v.book.publisherId && (
                          <Badge tone="accent">{t("resource.newBadge")}</Badge>
                        )}
                      </span>
                      <button
                        type="button"
                        className="text-muted hover:text-foreground text-xs"
                        onClick={() =>
                          set("book", { ...v.book, publisherId: null, publisherName: "" })
                        }
                      >
                        {t("common.change")}
                      </button>
                    </div>
                  ) : (
                    <Combobox
                      id={p.id}
                      endpoint="/api/autocomplete/publishers"
                      mapItem={mapPublisher}
                      ariaLabel={t("resource.publisher")}
                      placeholder={t("resource.publisherPlaceholder")}
                      createLabel={(q) => t("resource.createPublisher", { name: q })}
                      onPick={(o) =>
                        set("book", {
                          ...v.book,
                          publisherId: o.create ? null : o.id,
                          publisherName: o.label,
                        })
                      }
                    />
                  )
                }
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
            </>
          ) : (
            <>
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="text-muted size-3.5" /> {t("resource.releaseDate")}
                  </span>
                }
                optional
                error={err("publicationDate")}
              >
                {(p) => (
                  <FlexDateInput
                    id={p.id}
                    value={v.publicationDate}
                    invalid={!!err("publicationDate")}
                    placeholder="2024 / 2024-03-15"
                    onChange={(x) => set("publicationDate", x)}
                  />
                )}
              </Field>
              <Field
                label={v.type === "article" ? t("resource.readingTime") : t("resource.duration")}
                optional
                error={err("media.durationSeconds")}
              >
                {(p) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <DurationInput
                      id={p.id}
                      value={v.media.durationSeconds}
                      withSeconds={v.type !== "article"}
                      invalid={!!err("media.durationSeconds")}
                      onChange={(x) => set("media", { ...v.media, durationSeconds: x })}
                    />
                    {ytId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={detecting}
                        onClick={() => detectDuration(ytId, true)}
                      >
                        {detecting ? <Loader2 className="animate-spin" /> : <Timer />}
                        {t("resource.detectDuration")}
                      </Button>
                    )}
                  </div>
                )}
              </Field>
              <Field label={t("resource.where")} optional>
                {(p) => (
                  <Input
                    {...p}
                    value={v.media.channel}
                    onChange={(e) => set("media", { ...v.media, channel: e.target.value })}
                    placeholder={
                      v.type === "course" ? "Coursera, Udemy, TATU…" : "YouTube: kanal nomi"
                    }
                  />
                )}
              </Field>
              {v.type === "course" && (
                <Field label={t("resource.lessonCount")} optional error={err("media.lessonCount")}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      value={v.media.lessonCount}
                      onChange={(e) => set("media", { ...v.media, lessonCount: e.target.value })}
                    />
                  )}
                </Field>
              )}
            </>
          )}
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
          {isBook ? (
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
          ) : (
            <Field label={t("resource.watchUrl")} optional error={err("sourceUrl")}>
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
          )}
        </div>
      </section>

      {/* 6. Classification */}
      <section className="card p-5 sm:p-6">
        <SectionTitle title={t("resource.classification")} icon={<Tags />} hue="amber" />
        {categories.length > 0 && (
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium">{t("resource.categories")}</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = v.categoryIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    style={hueStyle(hueFor(c.id))}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-[var(--hue)]/40",
                      on
                        ? "chip hue-border"
                        : "border-border-strong text-muted hover:bg-surface-2 hover:text-foreground",
                    )}
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
                    {locale === "uz" ? c.nameUz : c.nameEn}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <Field label={t("common.tags")} optional>
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

      {/* 7. More (collapsed) */}
      <details
        className="card group p-5 sm:p-6"
        open={!!(v.identifiers.length || v.links.length || v.sourceUrl)}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2.5">
          <IconChip icon={<Link2 />} hue="slate" />
          <span className="text-[15px] font-semibold tracking-tight">{t("resource.more")}</span>
          <ChevronDown className="text-muted ml-auto size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-5 grid gap-4">
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
          {isMedia && (
            <>
              <Field
                label={t("resource.transcriptUrl")}
                optional
                error={err("media.transcriptUrl")}
              >
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
              <Field label={t("resource.transcript")} optional>
                {(p) => (
                  <Textarea
                    {...p}
                    rows={5}
                    value={v.media.transcript}
                    onChange={(e) => set("media", { ...v.media, transcript: e.target.value })}
                  />
                )}
              </Field>
            </>
          )}
          <div>
            <div className="mb-2 text-sm font-medium">{t("resource.identifiers")}</div>
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
                        v.identifiers.map((x, j) =>
                          j === i ? { ...x, scheme: e.target.value } : x,
                        ),
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
                    onBlur={() => {
                      if (id.scheme !== "youtube") return;
                      const yt = youtubeIdFromUrl(id.value);
                      if (!yt) return;
                      if (yt !== id.value)
                        set(
                          "identifiers",
                          v.identifiers.map((x, j) => (j === i ? { ...x, value: yt } : x)),
                        );
                      if (isMedia && !v.media.durationSeconds) detectDuration(yt, false);
                    }}
                    onChange={(e) =>
                      set(
                        "identifiers",
                        v.identifiers.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
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
              className="mt-1"
              onClick={() =>
                set("identifiers", [...v.identifiers, { scheme: "isbn13", value: "" }])
              }
            >
              <Plus /> {t("resource.addIdentifier")}
            </Button>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t("resource.linksSection")}</div>
            <ul className="flex flex-col gap-2">
              {v.links.map((l, i) => (
                <li key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
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
              className="mt-1"
              onClick={() => set("links", [...v.links, { kind: "reference", url: "", label: "" }])}
            >
              <Plus /> {t("resource.addLink")}
            </Button>
          </div>
        </div>
      </details>

      {!canEditDirectly && (
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
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <ImageIcon className="size-3.5" />
          {canEditDirectly
            ? resourceId && !isAdmin
              ? t("resource.canEditHint")
              : t("resource.newSubtitleAdmin")
            : t("resource.newSubtitleUser")}
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

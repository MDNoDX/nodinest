import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CollectionPicker } from "@/components/library/collection-picker";
import { NoteActions } from "@/components/notes/note-actions";
import { NoteRowActions } from "@/components/notes/note-row-actions";
import { Badge } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { collectionsContaining, getNote, listCollections } from "@/server/notes";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, locale, tz } = await pageContext();
  const t = await getTranslations();
  const n = await getNote(db, ctx, id);
  if (!n) notFound();
  const note = n.note;
  const [cols, inCols] = n.isOwner
    ? await Promise.all([listCollections(db, ctx), collectionsContaining(db, ctx, { noteId: id })])
    : [[], []];
  return (
    <article className="mx-auto max-w-3xl">
      {!n.isOwner && (
        <p className="bg-info-soft text-info mb-4 rounded-lg px-4 py-2 text-sm">
          {t("notes.readOnly")}
        </p>
      )}
      {note.deletedAt && (
        <div className="bg-warning-soft text-warning mb-4 flex items-center justify-between rounded-lg px-4 py-2 text-sm">
          {t("notes.trash")} <NoteRowActions id={note.id} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={note.kind === "quote" ? "accent" : "primary"}>
          {note.kind === "quote" ? t("notes.kindQuote") : t("notes.kindNote")}
        </Badge>
        {note.visibility === "private" ? (
          <Badge>
            <Lock className="size-3" /> {t("common.private")}
          </Badge>
        ) : (
          <Badge tone="info">{t("common.public")}</Badge>
        )}
        {note.kind === "quote" && (
          <Badge tone={note.verification === "verified" ? "success" : "neutral"}>
            {t(`verification.${note.verification}`)}
          </Badge>
        )}
        <span className="text-muted ml-auto text-xs">
          {fmtDateTime(note.createdAt, locale, tz)}
        </span>
      </div>
      {note.title && <h1 className="mb-4 text-3xl font-semibold tracking-tight">{note.title}</h1>}
      {note.kind === "quote" && (
        <figure className="mb-6">
          <blockquote className="border-accent border-l-4 py-1 pl-5 font-serif text-2xl leading-relaxed italic">
            “{note.quoteText}”
          </blockquote>
          <figcaption className="text-muted mt-3 pl-5 text-sm">
            {n.personName && (
              <Link
                href={`/people/${note.personId}`}
                className="text-foreground font-medium hover:underline"
              >
                — {n.personName}
              </Link>
            )}
            {n.resourceTitle && (
              <>
                {n.personName ? ", " : "— "}
                <Link href={`/library/${note.resourceId}`} className="italic hover:underline">
                  {n.resourceTitle}
                </Link>
              </>
            )}
            {note.pageFrom != null &&
              `, ${note.pageTo && note.pageTo !== note.pageFrom ? t("notes.pages", { from: note.pageFrom, to: note.pageTo }) : t("notes.page", { page: note.pageFrom })}`}
            {note.location && ` · ${note.location}`}
          </figcaption>
        </figure>
      )}
      {note.body && (
        <section className="card p-5">
          {note.kind === "quote" && (
            <h2 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
              {t("notes.commentary")}
            </h2>
          )}
          <p className="prose-nn text-[15px]">{note.body}</p>
        </section>
      )}
      {note.kind === "note" && n.resourceTitle && (
        <p className="text-muted mt-4 text-sm">
          {t("notes.resource")}:{" "}
          <Link href={`/library/${note.resourceId}`} className="text-foreground hover:underline">
            {n.resourceTitle}
          </Link>
          {note.pageFrom != null && ` · ${t("notes.page", { page: note.pageFrom })}`}
        </p>
      )}
      {n.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {n.tags.map((tg) => (
            <Link
              key={tg.id}
              href={`/notes?tag=${encodeURIComponent(tg.name.toLowerCase())}`}
              className="bg-surface-2 text-muted rounded-full px-2.5 py-0.5 text-xs hover:underline"
            >
              #{tg.name}
            </Link>
          ))}
        </div>
      )}
      {n.isOwner && !note.deletedAt && (
        <div className="mt-6 flex flex-wrap gap-2">
          <NoteActions id={note.id} />
          <CollectionPicker collections={cols} selected={inCols} target={{ noteId: note.id }} />
        </div>
      )}
    </article>
  );
}

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NoteForm } from "@/components/notes/note-form";
import { PageHeader } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { getNote } from "@/server/notes";

export const dynamic = "force-dynamic";

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db } = await pageContext();
  const t = await getTranslations("notes");
  const n = await getNote(db, ctx, id);
  if (!n || !n.isOwner || n.note.deletedAt) notFound();
  const s = (x: string | number | null) => (x == null ? "" : String(x));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("editTitle")} />
      <NoteForm
        noteId={id}
        initial={{
          kind: n.note.kind,
          title: s(n.note.title),
          body: s(n.note.body),
          quoteText: s(n.note.quoteText),
          resource: n.note.resourceId
            ? { id: n.note.resourceId, label: n.resourceTitle ?? "" }
            : null,
          person: n.note.personId ? { id: n.note.personId, label: n.personName ?? "" } : null,
          pageFrom: s(n.note.pageFrom),
          pageTo: s(n.note.pageTo),
          location: s(n.note.location),
          timestampSeconds: s(n.note.timestampSeconds),
          visibility: n.note.visibility,
          verification: n.note.verification,
          tags: n.tags.map((x) => x.name),
        }}
      />
    </div>
  );
}

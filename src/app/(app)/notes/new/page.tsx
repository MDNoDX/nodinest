import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { NoteForm } from "@/components/notes/note-form";
import { PageHeader } from "@/components/ui/misc";
import { withUser } from "@/db";
import { resources } from "@/db/schema";
import { pageContext, sp, type SP } from "@/lib/page";

export async function generateMetadata() {
  return { title: (await getTranslations("nav"))("newNote") };
}

export const dynamic = "force-dynamic";

export default async function NewNotePage({ searchParams }: { searchParams: SP }) {
  const { ctx, db } = await pageContext();
  const t = await getTranslations("notes");
  const p = await searchParams;
  const rid = sp(p.resource);
  const resource =
    rid && /^[0-9a-f-]{36}$/i.test(rid)
      ? ((
          await withUser(db, ctx, (tx) =>
            tx
              .select({ id: resources.id, label: resources.title })
              .from(resources)
              .where(eq(resources.id, rid)),
          )
        )[0] ?? null)
      : null;
  const kind = sp(p.kind) === "quote" ? "quote" : "note";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader section="notes" title={kind === "quote" ? t("newQuote") : t("newTitle")} />
      <NoteForm
        initial={{
          kind,
          title: "",
          body: "",
          quoteText: "",
          resource,
          person: null,
          pageFrom: "",
          pageTo: "",
          location: "",
          timestampSeconds: "",
          visibility: "private",
          verification: "unverified",
          tags: [],
        }}
      />
    </div>
  );
}

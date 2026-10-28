import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { listPeople, listResources } from "@/server/catalog";

export async function generateMetadata() {
  return { title: (await getTranslations("admin"))("archive") };
}

export default async function AdminArchive() {
  const { ctx, db } = await pageContext({ admin: true });
  const t = await getTranslations();
  const [res, ppl] = await Promise.all([
    listResources(db, ctx, { archived: true, pageSize: 60 }),
    listPeople(db, ctx, { archived: true }),
  ]);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader title={t("library.title")} />
        <ul className="flex flex-col gap-1 px-5 pb-5 text-sm">
          {res.items.length === 0 && <li className="text-muted">{t("admin.noArchived")}</li>}
          {res.items.map((r) => (
            <li key={r.id}>
              <Link href={`/library/${r.id}`} className="hover:underline">
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title={t("people.title")} />
        <ul className="flex flex-col gap-1 px-5 pb-5 text-sm">
          {ppl.items.length === 0 && <li className="text-muted">{t("admin.noArchived")}</li>}
          {ppl.items.map((p) => (
            <li key={p.id}>
              <Link href={`/people/${p.id}`} className="hover:underline">
                {p.full_name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

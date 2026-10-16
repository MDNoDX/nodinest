import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DuplicateGroupCard } from "@/components/library/duplicate-group";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { findLibraryDuplicates } from "@/server/merge";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("duplicates"))("title") };
}

export default async function DuplicatesPage() {
  const { ctx } = await pageContext();
  const t = await getTranslations("duplicates");
  const groups = await findLibraryDuplicates(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="library"
        eyebrow={
          <Link href="/library" className="hover:underline">
            {(await getTranslations("library"))("title")}
          </Link>
        }
        title={t("title")}
        subtitle={groups.length ? t("subtitle") : undefined}
      />
      {groups.length === 0 ? (
        <EmptyState hue="emerald" icon={<CheckCircle2 />} title={t("none")} />
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((g) => (
            <li key={g.items.map((i) => i.id).join("-")}>
              <DuplicateGroupCard
                items={g.items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

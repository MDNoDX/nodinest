import { getTranslations } from "next-intl/server";
import { permanentRedirect } from "next/navigation";

export async function generateMetadata() {
  return { title: (await getTranslations("nav"))("library") };
}

/** v2 URL — the konspekt became the free-form taqriz. */
export default async function KonspektRedirect({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/library/${(await params).id}/taqriz`);
}

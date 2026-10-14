import { permanentRedirect } from "next/navigation";

/** v2 URL — the konspekt became the free-form taqriz. */
export default async function KonspektRedirect({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/library/${(await params).id}/taqriz`);
}

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChatThread } from "@/components/chat/chat-thread";
import { pageContext } from "@/lib/page";
import { threadView } from "@/server/dm";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("chat"))("title") };
}

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx } = await pageContext();
  const view = await threadView(ctx, id).catch(() => null);
  if (!view) notFound();
  return <ChatThread key={view.id} me={ctx.userId} initial={view} />;
}

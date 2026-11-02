import { ChatLayout } from "@/components/chat/chat-layout";
import { pageContext } from "@/lib/page";
import { threadList } from "@/server/dm";

export const dynamic = "force-dynamic";

export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  const { ctx } = await pageContext();
  return (
    <ChatLayout me={ctx.userId} initial={await threadList(ctx)}>
      {children}
    </ChatLayout>
  );
}

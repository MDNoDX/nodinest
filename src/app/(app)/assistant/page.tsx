import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Chat, type ChatAction, type ChatMessage } from "@/components/assistant/chat";
import { ConversationList } from "@/components/assistant/conversation-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { pageContext, sp, type SP } from "@/lib/page";
import { aiAvailability, getConversation, listConversations } from "@/server/ai/assistant";
import { peekRateLimit } from "@/server/rate-limit";
import { limitsFor } from "@/server/premium";

export const dynamic = "force-dynamic";
// Confirmed actions may continue in the background (a book PDF: chapters, audiobook).
export const maxDuration = 300;
export async function generateMetadata() {
  return { title: (await getTranslations("assistant"))("title") };
}

export default async function AssistantPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, user } = await pageContext();
  const t = await getTranslations("assistant");
  const c = sp((await searchParams).c);
  const [convs, avail, plan, conv] = await Promise.all([
    listConversations(ctx),
    aiAvailability(user.isSuperadmin),
    limitsFor(ctx),
    c && /^[0-9a-f-]{36}$/i.test(c) ? getConversation(ctx, c) : Promise.resolve(null),
  ]);
  const messages: ChatMessage[] =
    conv?.messages.map((m) => {
      const trace = m.toolTrace as {
        trace?: { tool: string }[];
        actions?: string[];
        proposals?: string[];
        attachments?: ChatMessage["attachments"];
        visuals?: ChatMessage["visuals"];
      } | null;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        actions: trace?.actions ?? trace?.proposals ?? [],
        tools: trace?.trace?.map((x) => x.tool) ?? [],
        attachments: trace?.attachments ?? [],
        visuals: trace?.visuals ?? [],
      };
    }) ?? [];
  const actions: ChatAction[] =
    conv?.actions.map((a) => {
      const res = (a.result ?? {}) as {
        outcome?: ChatAction["outcome"];
        preview?: ChatAction["preview"];
      };
      return {
        id: a.id,
        tool: a.tool,
        args: a.args as Record<string, unknown>,
        status: a.status,
        outcome: res.outcome,
        preview: res.preview ?? null,
        error: a.error,
      };
    }) ?? [];

  return (
    <>
      <PageHeader
        section="assistant"
        title={t("title")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/assistant">
              <Plus /> {t("newChat")}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr] [&>*]:min-w-0">
        <aside className="hidden lg:block">
          <ConversationList
            items={convs.map((x) => ({ id: x.id, title: x.title ?? "…" }))}
            current={c ?? null}
          />
        </aside>
        <Chat
          key={conv?.conversation.id ?? "new"}
          conversationId={conv?.conversation.id ?? null}
          initialMessages={messages}
          initialActions={actions}
          available={avail.available}
          unavailableReason={avail.reason}
          dailyLimit={user.isSuperadmin ? null : plan.aiDaily}
          usedToday={user.isSuperadmin ? 0 : await peekRateLimit(db, `ai:${user.id}`, 86_400)}
          userId={user.id}
        />
      </div>
    </>
  );
}

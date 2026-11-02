import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Chat, type ChatAction, type ChatMessage } from "@/components/assistant/chat";
import { ConversationList } from "@/components/assistant/conversation-list";
import { Button } from "@/components/ui/button";
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
    // The whole height below the top bar: the history on the left, the talk on
    // the right; nothing can slip under the box to write in.
    <div className="-mx-4 -mt-6 flex h-[calc(100dvh-3.5rem-var(--bottom-nav,0px))] max-md:-mb-[calc(var(--bottom-nav,0px)+1.5rem)] sm:-mx-6 sm:-mt-8 md:-mb-8 md:h-[calc(100dvh-3.5rem)]">
      <aside className="border-border hidden w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex flex-col gap-3 p-3">
          <h1 className="px-1 text-lg font-bold">{t("title")}</h1>
          <Button variant="outline" size="sm" asChild className="w-full">
            <Link href="/assistant">
              <Plus /> {t("newChat")}
            </Link>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <ConversationList
            items={convs.map((x) => ({ id: x.id, title: x.title ?? "…" }))}
            current={c ?? null}
          />
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 lg:hidden">
          <h1 className="font-bold">{t("title")}</h1>
          <Button variant="outline" size="sm" asChild>
            <Link href="/assistant">
              <Plus /> {t("newChat")}
            </Link>
          </Button>
        </div>
        <div className="min-h-0 flex-1">
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
      </section>
    </div>
  );
}

import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Chat, type ChatAction, type ChatMessage } from "@/components/assistant/chat";
import { DeleteConversation } from "@/components/assistant/conversation-delete";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { pageContext, sp, type SP } from "@/lib/page";
import { aiAvailability, getConversation, listConversations } from "@/server/ai/assistant";
import { getAiSettings } from "@/server/settings";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("assistant"))("title") };
}

export default async function AssistantPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db } = await pageContext();
  const t = await getTranslations("assistant");
  const c = sp((await searchParams).c);
  const [convs, avail, settings, conv] = await Promise.all([
    listConversations(ctx),
    aiAvailability(),
    getAiSettings(db),
    c && /^[0-9a-f-]{36}$/i.test(c) ? getConversation(ctx, c) : Promise.resolve(null),
  ]);
  const messages: ChatMessage[] =
    conv?.messages.map((m) => {
      const trace = m.toolTrace as { trace?: { tool: string }[]; proposals?: string[] } | null;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        proposals: trace?.proposals ?? [],
        tools: trace?.trace?.map((x) => x.tool) ?? [],
      };
    }) ?? [];
  const actions: ChatAction[] =
    conv?.actions.map((a) => {
      const res = (a.result ?? {}) as {
        preview?: ChatAction["preview"];
        outcome?: ChatAction["outcome"];
      };
      return {
        id: a.id,
        tool: a.tool,
        args: a.args as Record<string, unknown>,
        status: a.status,
        preview: res.preview,
        outcome: res.outcome,
        error: a.error,
      };
    }) ?? [];

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/assistant">
              <Plus /> {t("newChat")}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          <h2 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
            {t("history")}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {convs.map((x) => (
              <li key={x.id} className="group flex items-center gap-1">
                <Link
                  href={`/assistant?c=${x.id}`}
                  aria-current={x.id === c ? "page" : undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm",
                    x.id === c
                      ? "bg-primary-soft text-primary"
                      : "text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {x.title}
                </Link>
                {x.id === c && <DeleteConversation id={x.id} />}
              </li>
            ))}
          </ul>
        </aside>
        <Chat
          key={conv?.conversation.id ?? "new"}
          conversationId={conv?.conversation.id ?? null}
          initialMessages={messages}
          initialActions={actions}
          available={avail.available}
          unavailableReason={avail.reason}
          dailyLimit={settings.dailyLimitPerUser}
        />
      </div>
    </>
  );
}

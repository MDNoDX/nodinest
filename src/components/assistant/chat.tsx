"use client";
import { ArrowUp, Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { askAssistantAction, confirmAiActionAction, rejectAiActionAction } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

export type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  actions?: string[];
  tools?: string[];
};
export type ChatAction = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: "proposed" | "completed" | "failed" | "rejected";
  outcome?: { href?: string; suggested?: boolean };
  error?: string | null;
};

/** Renders model text safely: paragraphs, bullet lines and **bold** only. */
function RichText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-[15px] leading-relaxed">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        const inline = (s: string) =>
          s
            .split(/(\*\*[^*]+\*\*)/g)
            .map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{part}</span>
              ),
            );
        return isList ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {lines.map((l, j) => (
              <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}

const SHOW_KEYS = [
  "title",
  "fullName",
  "resourceTitle",
  "noteTitle",
  "planTitle",
  "goalTitle",
  "collection",
  "name",
  "type",
  "status",
  "rating",
  "rank",
  "startOn",
  "endOn",
  "startedAt",
  "completedAt",
  "heading",
  "quoteText",
  "body",
  "coverUrl",
  "explanation",
];

function ActionCard({
  action,
  onChange,
}: {
  action: ChatAction;
  onChange: (a: ChatAction) => void;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const [pending, start] = useTransition();
  const router = useRouter();
  const label = t.has(`tools.${action.tool}`) ? t(`tools.${action.tool}`) : action.tool;
  const entries = Object.entries(action.args ?? {}).filter(
    ([k, v]) => SHOW_KEYS.includes(k) && v != null && v !== "",
  );
  const confirm = () =>
    start(async () => {
      const r = await confirmAiActionAction(action.id);
      if (!r.ok) return onChange({ ...action, status: "failed", error: r.code });
      if (r.data.status === "completed") {
        onChange({
          ...action,
          status: "completed",
          outcome: r.data.result as ChatAction["outcome"],
        });
        router.refresh();
      } else onChange({ ...action, status: "failed", error: r.data.code });
    });

  // Actions the assistant already performed: one compact line with a link.
  if (action.status !== "proposed") {
    const summary = entries.find(([k]) => k !== "type" && k !== "status")?.[1];
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          action.status === "completed"
            ? "border-success/30 bg-success-soft/40"
            : "border-border bg-surface-2",
        )}
      >
        {action.status === "completed" ? (
          <Check className="text-success size-4 shrink-0" />
        ) : (
          <X className="text-danger size-4 shrink-0" />
        )}
        <span className="font-medium">{label}</span>
        {summary != null && (
          <span className="text-muted min-w-0 truncate">· {String(summary)}</span>
        )}
        {action.status === "failed" && action.error && (
          <span className="text-danger text-xs">
            {te.has(action.error) ? te(action.error) : te("INTERNAL")}
          </span>
        )}
        {action.status === "rejected" && <Badge>{t("rejected")}</Badge>}
        {action.outcome?.suggested && (
          <span className="text-muted text-xs">{t("suggestedReview")}</span>
        )}
        {action.status === "completed" && action.outcome?.href && (
          <Link
            href={action.outcome.href}
            className="text-primary ml-auto shrink-0 text-xs font-medium hover:underline"
          >
            {t("openResult")} →
          </Link>
        )}
      </div>
    );
  }

  // Destructive actions wait for an explicit confirmation.
  return (
    <div className="border-warning/40 bg-surface rounded-xl border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles className="text-warning size-4" />
        <span className="text-sm font-semibold">{label}</span>
        <Badge tone="warning">{t("awaiting")}</Badge>
      </div>
      {entries.length > 0 && (
        <dl className="grid gap-1 text-sm">
          {entries.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted truncate text-xs">{k}</dt>
              <dd className="line-clamp-4 break-words">
                {Array.isArray(v) ? v.join(", ") : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={pending} onClick={confirm}>
          <Check /> {t("confirm")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await rejectAiActionAction(action.id);
              if (r.ok) onChange({ ...action, status: "rejected" });
            })
          }
        >
          <X /> {t("reject")}
        </Button>
      </div>
    </div>
  );
}

export function Chat({
  conversationId: initialConversation,
  initialMessages,
  initialActions,
  available,
  unavailableReason,
  dailyLimit,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  initialActions: ChatAction[];
  available: boolean;
  unavailableReason?: string;
  dailyLimit: number | null;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialConversation);
  const [messages, setMessages] = useState(initialMessages);
  const [actions, setActions] = useState<Record<string, ChatAction>>(
    Object.fromEntries(initialActions.map((a) => [a.id, a])),
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || pending) return;
    setError(null);
    setInput("");
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content: msg }]);
    start(async () => {
      const r = await askAssistantAction({ conversationId, message: msg });
      if (!r.ok) {
        setError(te(r.code));
        return;
      }
      const d = r.data;
      if (!conversationId) {
        setConversationId(d.conversationId);
        router.replace(`/assistant?c=${d.conversationId}`, { scroll: false });
      }
      setActions((a) => ({
        ...a,
        ...Object.fromEntries(
          d.actions.map((a) => [
            a.actionId,
            {
              id: a.actionId,
              tool: a.tool,
              args: (a.args ?? {}) as Record<string, unknown>,
              status: a.status,
              outcome: a.result as ChatAction["outcome"],
              error: a.error ?? null,
            },
          ]),
        ),
      }));
      setMessages((m) => [
        ...m,
        {
          id: `m-${Date.now()}`,
          role: "model",
          content: d.reply,
          actions: d.actions.map((a) => a.actionId),
          tools: d.trace.map((x) => x.tool),
        },
      ]);
    });
  };

  const reasonText =
    unavailableReason === "not_configured"
      ? t("notConfigured")
      : unavailableReason === "disabled"
        ? t("disabled")
        : unavailableReason === "quota"
          ? t("quota")
          : t("unavailable");

  return (
    <div className="flex min-h-[60vh] flex-col">
      {!available && (
        <div className="bg-warning-soft text-warning mb-4 rounded-xl p-4 text-sm">{reasonText}</div>
      )}
      <div className="flex flex-1 flex-col gap-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="border-border-strong rounded-xl border border-dashed p-6">
            <h2 className="mb-3 text-sm font-semibold">{t("examples.title")}</h2>
            <div className="flex flex-wrap gap-2">
              {(["one", "two", "three", "four"] as const).map((k) => (
                <button
                  key={k}
                  disabled={!available}
                  onClick={() => setInput(t(`examples.${k}`))}
                  className="border-border-strong hover:bg-surface-2 rounded-full border px-3 py-1.5 text-left text-sm disabled:opacity-50"
                >
                  {t(`examples.${k}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}
          >
            <div className="text-muted text-xs">{m.role === "user" ? t("you") : t("ai")}</div>
            <div
              className={cn(
                "max-w-[min(42rem,100%)] rounded-2xl px-4 py-3",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border-border bg-surface border",
              )}
            >
              {m.role === "user" ? (
                <p className="text-[15px] whitespace-pre-wrap">{m.content}</p>
              ) : (
                <RichText text={m.content} />
              )}
            </div>
            {m.tools && m.tools.length > 0 && (
              <div className="text-muted text-[11px]">
                {t("usedTools", { tools: [...new Set(m.tools)].join(", ") })}
              </div>
            )}
            {m.actions?.map((id) =>
              actions[id] ? (
                <div key={id} className="w-full max-w-[min(42rem,100%)]">
                  <ActionCard
                    action={actions[id]}
                    onChange={(a) => setActions((s) => ({ ...s, [a.id]: a }))}
                  />
                </div>
              ) : null,
            )}
          </div>
        ))}
        {pending && (
          <div className="text-muted flex items-center gap-2 text-sm">
            <span className="bg-accent size-2 animate-pulse rounded-full" /> {t("thinking")}
          </div>
        )}
        {error && (
          <p role="alert" className="bg-danger-soft text-danger rounded-lg p-3 text-sm">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="border-border bg-background/90 sticky bottom-0 -mx-4 mt-6 border-t px-4 pt-3 pb-4 backdrop-blur sm:mx-0"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="border-border-strong bg-surface focus-within:border-ring flex items-end gap-2 rounded-2xl border p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={6000}
            disabled={!available}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
          />
          <Button
            type="submit"
            size="icon"
            aria-label={t("send")}
            loading={pending}
            disabled={!available || !input.trim()}
          >
            {!pending && <ArrowUp />}
          </Button>
        </div>
        <p className="text-muted mt-1.5 text-center text-[11px]">
          {dailyLimit === null ? t("unlimitedNote") : t("limitNote", { limit: dailyLimit })}
        </p>
      </form>
    </div>
  );
}

"use client";
/* eslint-disable @next/next/no-img-element */
import {
  AlertTriangle,
  ArrowUp,
  BookPlus,
  Check,
  CheckCheck,
  FileType2,
  Loader2,
  Merge,
  Mic,
  Paperclip,
  Square,
  Trash2,
  X,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  askAssistantAction,
  confirmAiActionAction,
  rejectAiActionAction,
  transcribeAudioAction,
} from "@/app/actions/ai";
import { AttachmentView, type Attachment } from "@/components/media/attachment-view";
import { fmtSeconds, useRecorder } from "@/components/media/use-recorder";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { uploadMedia } from "@/lib/upload-media";

export type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  actions?: string[];
  tools?: string[];
  attachments?: Attachment[];
};
type Candidate = {
  id: string;
  title: string;
  type: string;
  cover: string | null;
  authors: string | null;
  year: string | null;
  myStatus: string | null;
  mine: boolean;
  reason: string;
  score: number;
};
export type ChatAction = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: "proposed" | "completed" | "failed" | "rejected";
  preview?: {
    duplicates?: Candidate[];
    keep?: Candidate;
    remove?: Candidate[];
    target?: Candidate;
    sources?: Candidate[];
    file?: { name: string; size: number; pdf: boolean } | null;
  } | null;
  outcome?: { href?: string; suggested?: boolean; linked?: boolean };
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

/** Fields shown on a generic proposal card, in this order. */
const FIELDS = [
  "title",
  "deck",
  "instruction",
  "fullName",
  "resourceTitle",
  "noteTitle",
  "planTitle",
  "goalTitle",
  "collectionName",
  "chapter",
  "status",
  "rating",
  "rank",
  "startOn",
  "endOn",
  "startedAt",
  "completedAt",
  "quoteText",
  "body",
  "markdown",
  "imageUrl",
  "explanation",
  "subtitle",
  "template",
  "goalWords",
  "contact",
];

function MiniCover({ src, title }: { src: string | null; title: string }) {
  return src ? (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className="border-border h-16 w-11 shrink-0 rounded-md border object-cover"
    />
  ) : (
    <span className="bg-surface-2 text-muted grid h-16 w-11 shrink-0 place-items-center rounded-md text-[10px] font-semibold">
      {title.slice(0, 2).toUpperCase()}
    </span>
  );
}

function CandidateRow({ c, action }: { c: Candidate; action?: React.ReactNode }) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-3">
      <MiniCover src={c.cover} title={c.title} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/library/${c.id}`}
          target="_blank"
          className="line-clamp-1 text-sm font-semibold hover:underline"
        >
          {c.title}
        </Link>
        <div className="text-muted line-clamp-1 text-xs">
          {[c.authors, c.year?.slice(0, 4)].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {c.myStatus ? (
            <Badge tone="success">
              {t(
                `status.${c.myStatus === "abandoned" || c.myStatus === "paused" ? "in_progress" : c.myStatus}`,
              )}
            </Badge>
          ) : (
            <Badge>{t("assistant.notInLibrary")}</Badge>
          )}
          {c.reason === "same_title" || c.reason === "same_identifier" ? (
            <Badge tone="warning">{t("assistant.sameBook")}</Badge>
          ) : c.reason === "similar_title" ? (
            <Badge tone="warning">{t("assistant.similarTitle")}</Badge>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function ProposalCard({
  action,
  onChange,
}: {
  action: ChatAction;
  onChange: (a: ChatAction) => void;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const ts = useTranslations("status");
  const router = useRouter();
  const [pending, start] = useTransition();
  const a = action.args ?? {};
  const label = t.has(`proposals.${action.tool}`) ? t(`proposals.${action.tool}`) : action.tool;

  const confirm = (choice?: Record<string, unknown>) =>
    start(async () => {
      const r = await confirmAiActionAction(action.id, choice);
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
  const reject = () =>
    start(async () => {
      const r = await rejectAiActionAction(action.id);
      if (r.ok) onChange({ ...action, status: "rejected" });
    });

  // Already decided: one compact line.
  if (action.status !== "proposed") {
    const summary = String(
      a.title ??
        a.fullName ??
        a.noteTitle ??
        a.planTitle ??
        a.goalTitle ??
        a.resourceTitle ??
        a.collectionName ??
        "",
    );
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
          <X
            className={cn(
              "size-4 shrink-0",
              action.status === "failed" ? "text-danger" : "text-muted",
            )}
          />
        )}
        <span className="font-medium">{label}</span>
        {summary && <span className="text-muted min-w-0 truncate">· {summary}</span>}
        <span className="text-muted text-xs">
          {action.status === "rejected"
            ? t("rejected")
            : action.status === "failed"
              ? te.has(action.error ?? "")
                ? te(action.error!)
                : t("failed")
              : action.outcome?.linked
                ? t("linkedExisting")
                : action.outcome?.suggested
                  ? t("suggestedReview")
                  : null}
        </span>
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

  const dups = action.preview?.duplicates ?? [];
  const hasDup = dups.length > 0;
  const Icon =
    action.tool === "add_resource"
      ? BookPlus
      : action.tool === "merge_resources"
        ? Merge
        : action.tool.startsWith("delete") ||
            action.tool.startsWith("remove") ||
            action.tool === "archive_resource"
          ? Trash2
          : FileType2;
  const danger = Icon === Trash2;

  return (
    <div
      className={cn(
        "bg-surface rounded-xl border p-4 shadow-sm",
        danger ? "border-danger/40" : hasDup ? "border-warning/50" : "border-primary/30",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon className={cn("size-4", danger ? "text-danger" : "text-primary")} />
        <span className="text-sm font-semibold">{label}</span>
        <Badge tone="warning">{t("awaiting")}</Badge>
      </div>

      {action.tool === "add_resource" ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <MiniCover src={(a.coverUrl as string) ?? null} title={String(a.title ?? "")} />
            <div className="min-w-0">
              <div className="font-semibold">{String(a.title ?? "")}</div>
              {Array.isArray(a.authors) && a.authors.length > 0 && (
                <div className="text-muted text-sm">{(a.authors as string[]).join(", ")}</div>
              )}
              <div className="text-muted mt-1 flex flex-wrap gap-x-3 text-xs">
                {a.originalDate ? (
                  <span>
                    {t("fields.originalDate")}: {String(a.originalDate)}
                  </span>
                ) : null}
                {a.editionDate ? (
                  <span>
                    {t("fields.editionDate")}: {String(a.editionDate)}
                  </span>
                ) : null}
                {a.pageCount ? (
                  <span>
                    {t("fields.pageCount")}: {String(a.pageCount)}
                  </span>
                ) : null}
                {a.publisher ? (
                  <span>
                    {t("fields.publisher")}: {String(a.publisher)}
                  </span>
                ) : null}
                {a.status ? (
                  <span>
                    {t("fields.status")}: {ts(String(a.status))}
                  </span>
                ) : null}
                {a.rating ? (
                  <span>
                    {t("fields.rating")}: {String(a.rating)}/10
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {hasDup && (
            <div className="bg-warning-soft/50 border-warning/40 rounded-lg border p-3">
              <p className="text-warning mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="size-4" /> {t("dupWarning")}
              </p>
              <div className="flex flex-col gap-2.5">
                {dups.map((c) => (
                  <CandidateRow
                    key={c.id}
                    c={c}
                    action={
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={pending}
                        onClick={() => confirm({ useExistingId: c.id })}
                      >
                        {t("useThis")}
                      </Button>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : action.tool === "merge_resources" && action.preview?.keep ? (
        <div className="flex flex-col gap-2.5 text-sm">
          <span className="text-muted text-xs font-semibold uppercase">{t("mergeKeep")}</span>
          <CandidateRow c={action.preview.keep} />
          <span className="text-muted mt-1 text-xs font-semibold uppercase">
            {t("mergeRemove")}
          </span>
          {(action.preview.remove ?? []).map((c) => (
            <CandidateRow key={c.id} c={c} />
          ))}
          <p className="text-muted text-xs">{t("mergeHint")}</p>
        </div>
      ) : action.tool === "make_study_cards" && action.preview?.sources ? (
        <div className="flex flex-col gap-2 text-sm">
          {action.preview.sources.map((c) => (
            <CandidateRow key={c.id} c={c} />
          ))}
          <dl className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{a.count ? t("cardsCount", { n: Number(a.count) }) : t("cardsAll")}</span>
            {a.focus ? <span>{t("cardsFocus", { focus: String(a.focus) })}</span> : null}
            {a.deck ? <span>{t("cardsDeck", { deck: String(a.deck) })}</span> : null}
          </dl>
          <p className="text-muted text-xs">{t("cardsHint")}</p>
        </div>
      ) : (action.tool === "add_book_pdf" || action.tool === "prepare_audiobook") &&
        action.preview ? (
        <div className="flex flex-col gap-2 text-sm">
          {action.preview.file && (
            <p className="flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-[var(--c-violet)]" />
              <span className="min-w-0 truncate font-medium">{action.preview.file.name}</span>
              <span className="text-muted shrink-0 text-xs">
                {(action.preview.file.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </p>
          )}
          {(action.preview.sources ?? []).map((c) => (
            <CandidateRow key={c.id} c={c} />
          ))}
          {!action.preview.sources?.length && a.title ? (
            <p className="text-muted text-xs">{t("bookFromEarlier", { title: String(a.title) })}</p>
          ) : null}
          <p className="text-muted text-xs">
            {action.tool === "add_book_pdf" ? t("bookPdfHint") : t("audiobookHint")}
          </p>
        </div>
      ) : action.tool === "delete_resource" && action.preview?.target ? (
        <div className="flex flex-col gap-2 text-sm">
          <CandidateRow c={action.preview.target} />
          <p className="text-muted text-xs">
            {action.preview.target.mine ? t("deleteHintMine") : t("deleteHintOther")}
          </p>
        </div>
      ) : (
        <dl className="grid gap-1 text-sm">
          {FIELDS.filter((k) => a[k] != null && a[k] !== "").map((k) => (
            <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
              <dt className="text-muted truncate text-xs">
                {t.has(`fields.${k}`) ? t(`fields.${k}`) : k}
              </dt>
              <dd className="line-clamp-5 break-words whitespace-pre-wrap">
                {k === "status"
                  ? ts(String(a[k]))
                  : Array.isArray(a[k])
                    ? (a[k] as unknown[]).join(", ")
                    : String(a[k])}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={danger ? "danger" : "primary"}
          loading={pending}
          onClick={() => confirm(hasDup ? { createNew: true } : undefined)}
        >
          <Check /> {hasDup ? t("addAnyway") : danger ? t("confirmDelete") : t("confirm")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={reject}>
          <X /> {t("reject")}
        </Button>
      </div>
    </div>
  );
}

/** "Confirm all" for a message's open proposals — in the order the AI made them; ones with duplicate doubts are left for a decision. */
function ProposalGroup({
  ids,
  actions,
  setActions,
}: {
  ids: string[];
  actions: Record<string, ChatAction>;
  setActions: React.Dispatch<React.SetStateAction<Record<string, ChatAction>>>;
}) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const open = ids.map((id) => actions[id]).filter((a) => a?.status === "proposed");
  const easy = open.filter((a) => !a.preview?.duplicates?.length);
  if (open.length < 2) return null;
  const all = async (yes: boolean) => {
    setBusy(true);
    for (const a of yes ? easy : open) {
      const r = yes ? await confirmAiActionAction(a.id) : await rejectAiActionAction(a.id);
      const next: ChatAction = !r.ok
        ? { ...a, status: "failed", error: r.code }
        : yes
          ? (() => {
              const d = (r as { data: { status: string; result?: unknown; code?: string } }).data;
              return d.status === "completed"
                ? { ...a, status: "completed", outcome: d.result as ChatAction["outcome"] }
                : { ...a, status: "failed", error: d.code ?? null };
            })()
          : { ...a, status: "rejected" };
      setActions((s) => ({ ...s, [a.id]: next }));
    }
    setBusy(false);
    router.refresh();
    if (yes && easy.length < open.length)
      toast.message(t("leftForYou", { count: open.length - easy.length }));
  };
  return (
    <div className="border-primary/30 bg-primary-soft/40 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
      <span className="text-sm font-medium">{t("openProposals", { count: open.length })}</span>
      <span className="ml-auto flex gap-2">
        <Button size="sm" loading={busy} disabled={!easy.length} onClick={() => void all(true)}>
          <CheckCheck /> {t("confirmAll", { count: easy.length })}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void all(false)}>
          {t("rejectAll")}
        </Button>
      </span>
    </div>
  );
}

type Pending = Attachment & { uploading?: boolean; progress?: number; transcribing?: boolean };

export function Chat({
  conversationId: initialConversation,
  initialMessages,
  initialActions,
  available,
  unavailableReason,
  dailyLimit,
  usedToday = 0,
  userId,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  initialActions: ChatAction[];
  available: boolean;
  unavailableReason?: string;
  dailyLimit: number | null;
  /** AI requests already made today (all AI features share the limit). */
  usedToday?: number;
  userId: string;
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
  const [files, setFiles] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const rec = useRecorder();

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const addFiles = async (list: FileList | File[] | Blob[], names?: string[]) => {
    for (const [i, f] of [...list].entries()) {
      const name = names?.[i] ?? (f instanceof File ? f.name : "file");
      const tmp = `tmp-${Date.now()}-${i}`;
      setFiles((s) => [...s, { fileId: tmp, name, mime: f.type, uploading: true, progress: 0 }]);
      try {
        const up = await uploadMedia(f, {
          userId,
          name,
          onProgress: (p) =>
            setFiles((s) => s.map((x) => (x.fileId === tmp ? { ...x, progress: p } : x))),
        });
        setFiles((s) => s.map((x) => (x.fileId === tmp ? { ...up } : x)));
      } catch (e) {
        setFiles((s) => s.filter((x) => x.fileId !== tmp));
        const code = e instanceof Error ? e.message : "";
        toast.error(te.has(code) ? te(code) : t("uploadFailed"));
      }
    }
  };

  const toText = (fileId: string) => {
    setFiles((s) => s.map((x) => (x.fileId === fileId ? { ...x, transcribing: true } : x)));
    void transcribeAudioAction(fileId).then((r) => {
      if (r.ok && r.data.text) {
        setInput((v) => (v ? `${v}\n${r.data.text}` : r.data.text));
        setFiles((s) => s.filter((x) => x.fileId !== fileId));
      } else {
        setFiles((s) => s.map((x) => (x.fileId === fileId ? { ...x, transcribing: false } : x)));
        toast.error(r.ok ? t("nothingHeard") : te(r.code));
      }
    });
  };

  const send = (text: string) => {
    const msg = text.trim();
    const ready = files.filter((f) => !f.uploading);
    if ((!msg && !ready.length) || pending || files.some((f) => f.uploading)) return;
    setError(null);
    setInput("");
    setFiles([]);
    const att: Attachment[] = ready.map(({ fileId, name, mime }) => ({ fileId, name, mime }));
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, role: "user", content: msg, attachments: att },
    ]);
    start(async () => {
      const r = await askAssistantAction({
        conversationId,
        message: msg,
        attachments: att.map((a) => a.fileId),
      });
      if (!r.ok) {
        setError(te(r.code));
        return;
      }
      const d = r.data;
      if (!conversationId) {
        setConversationId(d.conversationId);
        router.replace(`/assistant?c=${d.conversationId}`, { scroll: false });
      }
      setActions((s) => ({
        ...s,
        ...Object.fromEntries(
          d.actions.map((x) => [
            x.actionId,
            {
              id: x.actionId,
              tool: x.tool,
              args: (x.args ?? {}) as Record<string, unknown>,
              status: x.status,
              preview:
                (x.result as { preview?: ChatAction["preview"] } | undefined)?.preview ?? null,
              outcome: x.status === "completed" ? (x.result as ChatAction["outcome"]) : undefined,
              error: x.error ?? null,
            } satisfies ChatAction,
          ]),
        ),
      }));
      setMessages((m) => [
        ...m,
        {
          id: `m-${Date.now()}`,
          role: "model",
          content: d.reply,
          actions: d.actions.map((x) => x.actionId),
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
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}
          >
            <div className="text-muted text-xs">{m.role === "user" ? t("you") : t("ai")}</div>
            {m.attachments && m.attachments.length > 0 && (
              <div className="flex max-w-[min(42rem,100%)] flex-wrap justify-end gap-2">
                {m.attachments.map((a) => (
                  <AttachmentView key={a.fileId} a={a} />
                ))}
              </div>
            )}
            {m.content && (
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
            )}
            {m.actions && m.actions.length > 0 && (
              <div className="flex w-full max-w-[min(42rem,100%)] flex-col gap-2.5">
                <ProposalGroup ids={m.actions} actions={actions} setActions={setActions} />
                {m.actions.map((id) =>
                  actions[id] ? (
                    <ProposalCard
                      key={id}
                      action={actions[id]}
                      onChange={(a) => setActions((s) => ({ ...s, [a.id]: a }))}
                    />
                  ) : null,
                )}
              </div>
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
        className="border-border bg-background/90 sticky bottom-[var(--bottom-nav,0px)] -mx-4 mt-6 border-t px-4 pt-3 pb-4 backdrop-blur sm:mx-0"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
      >
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f) => (
              <span
                key={f.fileId}
                className="border-border bg-surface flex max-w-72 items-center gap-2 rounded-lg border py-1 pr-1 pl-2.5 text-xs"
              >
                {f.uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : f.mime.startsWith("audio/") ? (
                  <Mic className="size-3.5 text-[var(--c-rose)]" />
                ) : (
                  <Paperclip className="size-3.5" />
                )}
                <span className="truncate">{f.name}</span>
                {f.uploading && <span className="text-muted tabular-nums">{f.progress ?? 0}%</span>}
                {!f.uploading && f.mime.startsWith("audio/") && (
                  <button
                    type="button"
                    className="text-primary rounded px-1.5 py-0.5 font-medium hover:underline"
                    disabled={f.transcribing}
                    onClick={() => toText(f.fileId)}
                  >
                    {f.transcribing ? t("transcribing") : t("toText")}
                  </button>
                )}
                {!f.uploading && (
                  <button
                    type="button"
                    aria-label={t("removeFile")}
                    className="text-muted hover:text-foreground rounded p-0.5"
                    onClick={() => setFiles((s) => s.filter((x) => x.fileId !== f.fileId))}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {rec.state === "recording" ? (
          <div className="border-danger/40 bg-surface flex items-center gap-3 rounded-2xl border p-2 pl-4">
            <span className="bg-danger size-2.5 animate-pulse rounded-full" />
            <span className="text-sm font-medium tabular-nums">{fmtSeconds(rec.seconds)}</span>
            <span className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-full">
              <span
                className="bg-danger block h-full rounded-full transition-[width]"
                style={{ width: `${Math.round(rec.level * 100)}%` }}
              />
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={rec.cancel}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                const r = await rec.stop();
                if (r) void addFiles([r.blob], [r.name]);
              }}
            >
              <Square className="fill-current" /> {t("stopRecording")}
            </Button>
          </div>
        ) : (
          <div className="border-border-strong bg-surface focus-within:border-ring flex items-end gap-1.5 rounded-2xl border p-2">
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept="application/pdf,image/*,audio/*"
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("attach")}
              title={t("attach")}
              disabled={!available}
              onClick={() => picker.current?.click()}
            >
              <Paperclip />
            </Button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
                if (imgs.length) {
                  e.preventDefault();
                  void addFiles(imgs);
                }
              }}
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
              className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none"
            />
            {!input.trim() && !files.length ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("record")}
                title={
                  rec.state === "denied" || rec.state === "nomic" || rec.state === "error"
                    ? t(
                        rec.state === "denied"
                          ? "micDenied"
                          : rec.state === "nomic"
                            ? "noMic"
                            : "micError",
                      )
                    : t("record")
                }
                disabled={!available}
                onClick={() => void rec.start()}
              >
                <Mic />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                aria-label={t("send")}
                loading={pending}
                disabled={!available || files.some((f) => f.uploading)}
              >
                {!pending && <ArrowUp />}
              </Button>
            )}
          </div>
        )}
        {(rec.state === "denied" || rec.state === "nomic" || rec.state === "error") && (
          <p className="text-danger mt-1.5 text-xs">
            {t(rec.state === "denied" ? "micDenied" : rec.state === "nomic" ? "noMic" : "micError")}
          </p>
        )}
        {dailyLimit !== null && (
          <p className="text-muted mt-1.5 text-center text-[11px]">
            {t("limitLeft", { left: Math.max(0, dailyLimit - usedToday), limit: dailyLimit })}
          </p>
        )}
      </form>
    </div>
  );
}

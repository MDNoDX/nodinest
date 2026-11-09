"use client";
import { CheckSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteConversationsAction } from "@/app/actions/ai";
import { ask } from "@/components/ui/ask";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";

/** The history: choose several conversations and delete them at once. */
export function ConversationList({
  items,
  current,
}: {
  items: { id: string; title: string }[];
  current: string | null;
}) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const { pending, exec } = useAction();
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">{t("history")}</h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelecting((s) => !s);
              setChosen([]);
            }}
            aria-label={t("selectChats")}
            title={t("selectChats")}
            className={cn(
              "hover:text-foreground rounded p-1",
              selecting ? "text-primary" : "text-muted",
            )}
          >
            <CheckSquare className="size-4" />
          </button>
        )}
      </div>
      {selecting && (
        // On top, where the choosing starts (no scrolling to the end to delete).
        <div className="bg-surface border-border sticky top-0 z-10 mb-2 flex items-center gap-1 rounded-lg border p-1">
          <button
            type="button"
            onClick={() => setChosen(chosen.length === items.length ? [] : items.map((x) => x.id))}
            className="text-muted hover:text-foreground rounded px-2 py-1 text-xs font-medium"
          >
            {chosen.length === items.length ? t("selectNone") : t("selectAll")}
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger ml-auto"
            disabled={chosen.length === 0}
            loading={pending}
            onClick={async () => {
              if (!(await ask({ message: t("deleteChats", { n: chosen.length }), remove: true })))
                return;
              exec(() => deleteConversationsAction(chosen), {
                onSuccess: () => {
                  setSelecting(false);
                  const gone = current && chosen.includes(current);
                  setChosen([]);
                  if (gone) router.push("/assistant");
                },
              });
            }}
          >
            <Trash2 /> {t("deleteN", { n: chosen.length })}
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((x) => (
          <li key={x.id} className="flex items-center gap-1.5">
            {selecting && (
              <input
                type="checkbox"
                aria-label={x.title}
                className="size-4 shrink-0 accent-[var(--primary)]"
                checked={chosen.includes(x.id)}
                onChange={(e) =>
                  setChosen((c) => (e.target.checked ? [...c, x.id] : c.filter((v) => v !== x.id)))
                }
              />
            )}
            <Link
              href={`/assistant?c=${x.id}`}
              aria-current={x.id === current ? "page" : undefined}
              className={cn(
                "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm",
                x.id === current
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {x.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

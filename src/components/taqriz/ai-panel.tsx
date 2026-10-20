"use client";
import type { Editor } from "@tiptap/react";
import { AudioLines, MessageSquareText, PenLine, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DockSource } from "@/components/media/media-dock";
import { cn } from "@/lib/cn";
import { AskTab } from "./ai/ask-tab";
import { ListenModes } from "./ai/listen";
import { WriteTab } from "./ai/write-tab";
import type { AskRequest, PanelTab } from "./ai/types";

export type { AskRequest, PanelTab } from "./ai/types";
/**
 * Right-hand AI panel of the taqriz editor:
 *  - "Ask": explains the selected word / passage, with follow-up questions;
 *    answers can be put into the taqriz at the cursor.
 *  - "Listen": while the video / audio plays in the dock, the AI writes the
 *    speech out (verbatim or as a konspekt), minute by minute, at the end of
 *    the taqriz, where the user can correct it at any time.
 */
export function AiPanel({
  editor,
  resourceId,
  media,
  tab,
  setTab,
  ask,
  onClose,
  startFull,
  mode = "taqriz",
  userId,
  title,
}: {
  userId: string;
  title: string;
  startFull?: boolean;
  mode?: "taqriz" | "book";
  editor: Editor;
  resourceId: string;
  media: DockSource | null;
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  ask: AskRequest | null;
  onClose: () => void;
}) {
  const t = useTranslations("taqrizAi");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex items-center gap-1 border-b px-3 py-2">
        <Sparkles className="text-primary size-4" />
        <div role="tablist" className="bg-surface-2 ml-1 flex rounded-lg p-0.5 text-xs">
          {(["write", "ask", "listen"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 font-medium whitespace-nowrap",
                tab === k
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {k === "write" ? (
                <PenLine className="size-3.5" />
              ) : k === "ask" ? (
                <MessageSquareText className="size-3.5" />
              ) : (
                <AudioLines className="size-3.5" />
              )}
              {t(k === "write" ? "tabWrite" : k === "ask" ? "tabAsk" : "tabListen")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-foreground ml-auto rounded-md p-1"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>
      {/* All stay mounted: switching tabs never stops listening or loses a draft. */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", tab !== "write" && "hidden")}>
        <WriteTab editor={editor} resourceId={resourceId} mode={mode} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", tab !== "ask" && "hidden")}>
        <AskTab key={ask?.n ?? 0} editor={editor} resourceId={resourceId} ask={ask} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", tab !== "listen" && "hidden")}>
        <ListenModes
          editor={editor}
          resourceId={resourceId}
          media={media}
          startFull={startFull}
          userId={userId}
          title={title}
        />
      </div>
    </div>
  );
}

"use client";
import { Loader2, Search, Smile } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { DmGif } from "@/server/dm";

/** Emojis by kind, the most used first (no library: a few hundred cover a chat). */
const EMOJI: [string, string][] = [
  [
    "smileys",
    "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕",
  ],
  [
    "gestures",
    "👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 👏 🙌 🫶 👐 🤲 💪 ✍️ 💅 🤳 🫡 🙇 🙋 🙆 🙅 🤷 🤦",
  ],
  [
    "hearts",
    "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 🔥 ✨ ⭐ 🌟 💫 💯 ✅ ❌ ❗ ❓ 💤 💬 🎉 🎊 🎁 🏆 🥇",
  ],
  [
    "study",
    "📚 📖 📕 📗 📘 📙 📓 📒 📝 ✏️ 🖊️ 🖋️ 📌 📎 🔖 🗂️ 📅 ⏰ ⏳ 🧠 💡 🎓 🏫 🧪 🔬 🧮 🌍 🗺️ 🕌 🕋 📿 🤲",
  ],
  [
    "nature",
    "🌸 🌹 🌷 🌻 🌼 🌱 🌿 🍀 🍁 🍂 🌳 🌲 🌴 🌵 🌊 🌙 🌞 ⛅ 🌧️ ❄️ 🌈 🐱 🐶 🐦 🦋 🐝 🐢 🦁 🐎",
  ],
  ["food", "☕ 🍵 🥛 🍞 🥐 🧀 🍳 🥗 🍲 🍜 🍕 🍔 🍟 🌯 🍉 🍇 🍎 🍐 🍊 🍌 🍒 🍓 🥝 🍯 🍰 🎂 🍫 🍬"],
  ["things", "📱 💻 ⌨️ 🖥️ 🎧 🎤 🎬 📷 📸 🎵 🎶 🎮 ⚽ 🏀 🏃 🚶 🚗 ✈️ 🏠 🕰️ 💰 🔑 🔒 🔔 📢 🎯 🧩 🪄"],
];
const RECENT_KEY = "nn:emoji-recent";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

type Tab = "emoji" | "gifs" | "stickers";

/**
 * The smile button of the chat: emojis (put where the cursor is), GIFs and
 * stickers from GIPHY (sent at once). Shared with post comments.
 */
export function EmojiGif({
  onEmoji,
  onGif,
  className,
}: {
  onEmoji: (e: string) => void;
  onGif?: (g: DmGif) => void;
  className?: string;
}) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("emoji");
  const [recent, setRecent] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{
    key: string;
    available: boolean;
    provider?: string;
    items: DmGif[];
  } | null>(null);

  const key = `${tab}:${q.trim()}`;
  useEffect(() => {
    if (!open || tab === "emoji") return;
    let stop = false;
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/gif?kind=${tab}&q=${encodeURIComponent(q.trim())}`).catch(
        () => null,
      );
      const j = r?.ok
        ? ((await r.json()) as { available: boolean; provider?: string; items: DmGif[] })
        : { available: true, items: [] };
      if (!stop) setRes({ key, ...j });
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [open, tab, q, key]);

  const pick = (e: string) => {
    onEmoji(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 24);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const loading = tab !== "emoji" && res?.key !== key;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRecent(readRecent());
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t("emoji")}
          title={t("emoji")}
          className={cn(
            "text-muted hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full transition-colors",
            open && "text-primary",
            className,
          )}
        >
          <Smile className="size-5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="bg-surface border-border animate-scale-in z-[70] flex h-[min(24rem,60dvh)] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        >
          {tab !== "emoji" && (
            <label className="bg-surface-2 m-2 mb-0 flex h-9 items-center gap-2 rounded-xl px-3">
              <Search className="text-muted size-4" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t(tab === "gifs" ? "gifSearch" : "stickerSearch")}
                aria-label={t(tab === "gifs" ? "gifSearch" : "stickerSearch")}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {loading && <Loader2 className="text-muted size-4 animate-spin" />}
            </label>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {tab === "emoji" ? (
              <>
                {recent.length > 0 && (
                  <Group title={t("recentEmoji")} list={recent} onPick={pick} />
                )}
                {EMOJI.map(([k, list]) => (
                  <Group key={k} title={t(`emojiKind.${k}`)} list={list.split(" ")} onPick={pick} />
                ))}
              </>
            ) : res && res.key === key && !res.available ? (
              <p className="text-muted p-4 text-center text-sm">{t("gifOff")}</p>
            ) : (
              <div className="columns-2 gap-2">
                {(res?.key === key ? res.items : []).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      onGif?.(g);
                      setOpen(false);
                    }}
                    className="mb-2 block w-full overflow-hidden rounded-lg transition-transform hover:scale-[1.03]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.url}
                      alt=""
                      loading="lazy"
                      width={g.w}
                      height={g.h}
                      className={cn("h-auto w-full", tab === "gifs" && "bg-surface-2")}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-border flex items-center gap-1 border-t p-1.5">
            {(["emoji", ...(onGif ? (["gifs", "stickers"] as const) : [])] as Tab[]).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTab(x)}
                aria-pressed={tab === x}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  tab === x ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground",
                )}
              >
                {t(`pickTab.${x}`)}
              </button>
            ))}
            {tab !== "emoji" && (
              <span className="text-muted ml-auto pr-1 text-[10px] font-semibold tracking-wide">
                Powered by {res?.provider ?? "KLIPY"}
              </span>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Group({
  title,
  list,
  onPick,
}: {
  title: string;
  list: string[];
  onPick: (e: string) => void;
}) {
  return (
    <section className="mb-2">
      <h3 className="text-muted px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
        {title}
      </h3>
      <div className="grid grid-cols-8 gap-0.5">
        {list.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="hover:bg-surface-2 grid aspect-square place-items-center rounded-lg text-2xl leading-none transition-transform active:scale-90"
          >
            {e}
          </button>
        ))}
      </div>
    </section>
  );
}

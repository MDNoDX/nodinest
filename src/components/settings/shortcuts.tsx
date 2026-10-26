"use client";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { setDockPrefs, useDockPrefs } from "@/components/media/dock-prefs";
import { TOUR_EVENT } from "@/components/onboarding/tour";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  SHORTCUTS,
  comboFrom,
  comboLabel,
  resetShortcuts,
  same,
  setShortcut,
  useIsApple,
  useShortcuts,
  type Combo,
  type ShortcutId,
} from "@/lib/shortcuts";

const inMacApp = () =>
  !!(window as unknown as { webkit?: { messageHandlers?: { nodinest?: unknown } } }).webkit
    ?.messageHandlers?.nodinest;

/**
 * Every keyboard shortcut of the app with this device's keys (⌘ ⌥ on a Mac).
 * The app's own shortcuts can be changed: click, press the new keys.
 */
export function ShortcutsSettings() {
  const t = useTranslations("shortcuts");
  const prefs = useDockPrefs();
  const keys = useShortcuts();
  const apple = useIsApple();
  const macApp = useSyncExternalStore(
    () => () => {},
    inMacApp,
    () => false,
  );
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const label = (c: Combo) => comboLabel(c, apple);
  const fixed = (mac: string, other: string) => (apple ? mac : other);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") return setRecording(null);
      const c = comboFrom(e);
      if (!c) return setNotice(t("needModifier"));
      const taken = (Object.keys(keys) as ShortcutId[]).find(
        (id) => id !== recording && same(keys[id], c),
      );
      if (taken) return setNotice(t("taken", { name: t(`a.${taken}`) }));
      setShortcut(recording, c);
      setNotice(null);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, keys, t]);

  const editable = (id: ShortcutId) => (
    <div key={id} className="flex items-center justify-between gap-3">
      <dt className="text-muted">{t(`a.${id}`)}</dt>
      <dd className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setRecording(recording === id ? null : id);
          }}
          title={t("change")}
          className={cn(
            "rounded-md border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap",
            recording === id
              ? "border-primary bg-primary-soft text-primary animate-pulse"
              : "border-border bg-surface-2 hover:border-border-strong",
          )}
        >
          {recording === id ? t("pressKeys") : label(keys[id])}
        </button>
        {!same(keys[id], SHORTCUTS[id]) && (
          <button
            type="button"
            onClick={() => setShortcut(id, null)}
            className="text-muted hover:text-foreground rounded p-0.5"
            aria-label={t("resetOne")}
            title={`${t("resetOne")}: ${label(SHORTCUTS[id])}`}
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
  const plain = (keysText: string, name: string) => (
    <div key={name} className="flex items-center justify-between gap-3">
      <dt className="text-muted">{name}</dt>
      <dd>
        <kbd className="border-border bg-surface-2 rounded-md border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap opacity-80">
          {keysText}
        </kbd>
      </dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted text-sm">
        {t("intro")} {apple && t("macNote")}
      </p>
      <div className="grid gap-6 sm:grid-cols-3">
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t("general")}</h3>
          <dl className="flex flex-col gap-1.5 text-sm">
            {editable("search")}
            {plain("Esc", t("closeDialog"))}
          </dl>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t("player")}</h3>
          <dl className="flex flex-col gap-1.5 text-sm">
            {(["playPause", "back5", "fwd5", "stamp"] as const).map(editable)}
          </dl>
          <p className="text-muted mt-2 text-xs">{macApp ? t("systemMacApp") : t("systemWeb")}</p>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t("taqriz")}</h3>
          <dl className="flex flex-col gap-1.5 text-sm">
            {(["askAi", "quote", "note", "chapter", "subchapter"] as const).map(editable)}
            {plain(fixed("⌘B", "Ctrl+B"), t("bold"))}
            {plain(fixed("⌘I", "Ctrl+I"), t("italic"))}
            {plain(fixed("⇧⌘S", "Ctrl+Shift+S"), t("strike"))}
            {plain(fixed("⇧⌘8", "Ctrl+Shift+8"), t("bullets"))}
            {plain(fixed("⇧⌘7", "Ctrl+Shift+7"), t("numbers"))}
            {plain(fixed("⌘Z", "Ctrl+Z"), t("undo"))}
            {plain(fixed("⇧⌘Z", "Ctrl+Shift+Z"), t("redo"))}
          </dl>
        </section>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {notice ? (
          <span className="text-warning">{notice}</span>
        ) : (
          <span className="text-muted text-xs">{t("changeHint")}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={(Object.keys(SHORTCUTS) as ShortcutId[]).every((id) =>
            same(keys[id], SHORTCUTS[id]),
          )}
          onClick={resetShortcuts}
        >
          <RotateCcw className="size-4" /> {t("resetAll")}
        </Button>
      </div>
      <div className="border-border flex flex-col gap-2.5 border-t pt-4 text-sm">
        <div className="mb-2 flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
          >
            {t("replayTour")}
          </Button>
          <span className="text-muted text-xs">{t("replayTourHint")}</span>
        </div>
        <h3 className="font-semibold">{t("playerSettings")}</h3>
        <p className="text-muted text-sm leading-relaxed">{t("playerExplain")}</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={prefs.showKeys}
            onChange={(e) => setDockPrefs({ showKeys: e.target.checked })}
          />
          {t("showKeys")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={prefs.typePause}
              onChange={(e) => setDockPrefs({ typePause: e.target.checked })}
            />
            {t("typePause")}
          </label>
          <select
            aria-label={t("resumeAfter")}
            value={prefs.resumeAfter}
            disabled={!prefs.typePause}
            onChange={(e) => setDockPrefs({ resumeAfter: Number(e.target.value) })}
            className="border-border-strong bg-surface h-8 rounded-md border px-2 text-sm disabled:opacity-50"
          >
            {[1, 1.5, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t("resumeAfterN", { n })}
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted -mt-1 text-xs">{t(macApp ? "typePauseMacApp" : "typePauseWeb")}</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={prefs.audioOnly}
            onChange={(e) => setDockPrefs({ audioOnly: e.target.checked })}
          />
          {t("audioOnly")}
        </label>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!prefs.pos}
            onClick={() => setDockPrefs({ pos: null })}
          >
            {t("resetPosition")}
          </Button>
          <span className="text-muted text-xs">{t("dragHint")}</span>
        </div>
      </div>
    </div>
  );
}

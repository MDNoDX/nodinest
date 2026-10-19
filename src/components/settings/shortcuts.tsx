"use client";
import { useTranslations } from "next-intl";
import {
  setDockPrefs,
  useAltLabel,
  useDockPrefs,
  useModLabel,
} from "@/components/media/dock-prefs";
import { Button } from "@/components/ui/button";

/** Every keyboard shortcut of the app, with the keys of this device (⌘ ⌥ on a Mac). */
export function ShortcutsSettings() {
  const t = useTranslations("shortcuts");
  const prefs = useDockPrefs();
  const alt = useAltLabel();
  const mod = useModLabel();
  const mac = alt === "⌥";
  const shift = mac ? "⇧" : "Shift+";

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: t("general"),
      rows: [
        [`${mod}K`, t("search")],
        ["Esc", t("closeDialog")],
      ],
    },
    {
      title: t("player"),
      rows: [
        [`${alt}K`, t("playPause")],
        [`${alt}J`, t("back5")],
        [`${alt}L`, t("fwd5")],
        [`${alt}T`, t("stamp")],
      ],
    },
    {
      title: t("taqriz"),
      rows: [
        [`${mod}B`, t("bold")],
        [`${mod}I`, t("italic")],
        [`${mod}${shift}S`, t("strike")],
        [`${mod}${shift}B`, t("quote")],
        [`${mod}${alt}2`, t("chapter")],
        [`${mod}${alt}3`, t("subchapter")],
        [`${mod}${shift}8`, t("bullets")],
        [`${mod}${shift}7`, t("numbers")],
        [`${mod}Z`, t("undo")],
        [`${mod}${shift}Z`, t("redo")],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {mac && <p className="text-muted text-sm">{t("macNote")}</p>}
      <div className="grid gap-5 sm:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-sm font-semibold">{g.title}</h3>
            <dl className="flex flex-col gap-1.5 text-sm">
              {g.rows.map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between gap-3">
                  <dt className="text-muted">{label}</dt>
                  <dd>
                    <kbd className="border-border bg-surface-2 rounded-md border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap">
                      {keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="border-border flex flex-col gap-2.5 border-t pt-4 text-sm">
        <h3 className="font-semibold">{t("playerSettings")}</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={prefs.showKeys}
            onChange={(e) => setDockPrefs({ showKeys: e.target.checked })}
          />
          {t("showKeys")}
        </label>
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

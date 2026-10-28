"use client";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveAdsAction } from "@/app/actions/premium";
import { AdCard } from "@/components/ads/ad-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";
import type { Ad, AdsSettings } from "@/server/ads";

const PLACES = ["home", "sidebar"] as const;

/** Admin → Ads: cards shown to the free plan, with click counts. */
export function AdsAdmin({
  initial,
  clicks,
}: {
  initial: AdsSettings;
  clicks: Record<string, number>;
}) {
  const t = useTranslations("adsAdmin");
  const ta = useTranslations("ads");
  const [v, setV] = useState(initial);
  const { pending, exec } = useAction();
  const set = (i: number, patch: Partial<Ad>) =>
    setV({ ...v, items: v.items.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => saveAdsAction(v), { success: t("saved") });
      }}
    >
      <p className="text-muted text-sm">{t("hint")}</p>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-[var(--primary)]"
          checked={v.enabled}
          onChange={(e) => setV({ ...v, enabled: e.target.checked })}
        />
        {t("enabled")}
      </label>
      {v.items.map((a, i) => (
        <section key={a.id} className="card grid gap-4 p-5 lg:grid-cols-[1fr_18rem]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("title")}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={80}
                  value={a.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("url")}>
              {(p) => (
                <Input
                  {...p}
                  placeholder="https://"
                  value={a.url}
                  onChange={(e) => set(i, { url: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("text")} optional>
              {(p) => (
                <Input
                  {...p}
                  maxLength={240}
                  value={a.text}
                  onChange={(e) => set(i, { text: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("image")} optional>
              {(p) => (
                <Input
                  {...p}
                  placeholder="https://…png"
                  value={a.image}
                  onChange={(e) => set(i, { image: e.target.value })}
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={a.active}
                  onChange={(e) => set(i, { active: e.target.checked })}
                />
                {t("active")}
              </label>
              {PLACES.map((pl) => (
                <label key={pl} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={a.places.includes(pl)}
                    onChange={(e) =>
                      set(i, {
                        places: e.target.checked
                          ? [...a.places, pl]
                          : a.places.filter((x) => x !== pl),
                      })
                    }
                  />
                  {t(`place_${pl}`)}
                </label>
              ))}
              <span className="text-muted ml-auto">{t("clicks", { n: clicks[a.id] ?? 0 })}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => setV({ ...v, items: v.items.filter((_, k) => k !== i) })}
              >
                <Trash2 /> {t("remove")}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-muted mb-2 text-xs">{t("preview")}</p>
            <AdCard ad={a} label={ta("label")} />
          </div>
        </section>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={v.items.length >= 20}
          onClick={() =>
            setV({
              ...v,
              items: [
                ...v.items,
                {
                  id: `ad-${Date.now().toString(36)}`,
                  active: true,
                  title: "",
                  text: "",
                  url: "https://",
                  image: "",
                  places: ["home"],
                },
              ],
            })
          }
        >
          <Plus /> {t("add")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

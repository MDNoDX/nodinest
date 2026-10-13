"use client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Loader2,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createSectionAction,
  deleteSectionAction,
  reorderSectionsAction,
  updateSectionAction,
} from "@/app/actions/personal";
import { Cover } from "@/components/library/cover";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

type Section = {
  id: string;
  title: string;
  content: string;
  pageFrom: number | null;
  pageTo: number | null;
};

/**
 * Two-pane konspekt: chapters on the left (like a document outline), the
 * selected chapter on the right. Edits autosave after a short pause.
 */
export function KonspektEditor({
  resource,
  initialSections,
  initialSelected,
}: {
  resource: { id: string; title: string; type: string; cover: string | null; authors: string };
  initialSections: Section[];
  initialSelected: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [selected, setSelected] = useState<string | null>(
    initialSelected && initialSections.some((s) => s.id === initialSelected)
      ? initialSelected
      : (initialSections[0]?.id ?? null),
  );
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = sections.find((s) => s.id === selected) ?? null;

  const persist = useCallback(
    async (s: Section) => {
      setState("saving");
      const r = await updateSectionAction(s.id, {
        title: s.title.trim() || t("konspekt.newChapter"),
        content: s.content,
        pageFrom: s.pageFrom ?? "",
        pageTo: s.pageTo ?? "",
      });
      if (r.ok) setState("saved");
      else {
        setState("dirty");
        toast.error(t(`errors.${r.code}`));
      }
    },
    [t],
  );

  const update = (patch: Partial<Section>) => {
    if (!current) return;
    const next = { ...current, ...patch };
    setSections((list) => list.map((s) => (s.id === next.id ? next : s)));
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), 900);
  };

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [state]);

  const add = async () => {
    const title = `${t("konspekt.newChapter")} ${sections.length + 1}`;
    const r = await createSectionAction(resource.id, { title, content: "" }, selected);
    if (!r.ok) return void toast.error(t(`errors.${r.code}`));
    const idx = selected ? sections.findIndex((s) => s.id === selected) + 1 : sections.length;
    const next = [...sections];
    next.splice(idx, 0, { id: r.data, title, content: "", pageFrom: null, pageTo: null });
    setSections(next);
    setSelected(r.data);
  };

  const move = async (id: string, dir: -1 | 1) => {
    const i = sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
    const r = await reorderSectionsAction(
      resource.id,
      next.map((s) => s.id),
    );
    if (!r.ok) toast.error(t(`errors.${r.code}`));
  };

  const remove = async (id: string) => {
    const r = await deleteSectionAction(id);
    if (!r.ok) return void toast.error(t(`errors.${r.code}`));
    const next = sections.filter((s) => s.id !== id);
    setSections(next);
    setSelected(next[0]?.id ?? null);
    router.refresh();
  };

  const words = current ? (current.content.trim().match(/\S+/g)?.length ?? 0) : 0;

  return (
    <div className="-mx-4 -my-6 grid min-h-[calc(100dvh-3.5rem)] sm:-mx-6 sm:-my-8 lg:grid-cols-[18rem_1fr]">
      {/* Outline */}
      <aside className="border-border bg-surface/60 flex flex-col border-b lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:border-r lg:border-b-0">
        <div className="flex items-start gap-3 p-4">
          <Cover
            type={resource.type as "book"}
            title={resource.title}
            src={resource.cover}
            size="sm"
          />
          <div className="min-w-0">
            <Link
              href={`/library/${resource.id}`}
              className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              <ArrowLeft className="size-3" /> {t("konspekt.back")}
            </Link>
            <div className="line-clamp-2 text-sm leading-snug font-semibold">{resource.title}</div>
            {resource.authors && (
              <div className="text-muted truncate text-xs">{resource.authors}</div>
            )}
          </div>
        </div>
        <div className="text-muted flex items-center justify-between px-4 pb-2 text-[11px] font-semibold tracking-wide uppercase">
          {t("konspekt.contents")}
          <button
            onClick={add}
            className="text-primary hover:bg-primary-soft rounded-md p-1"
            aria-label={t("konspekt.addChapter")}
            title={t("konspekt.addChapter")}
          >
            <Plus className="size-4" />
          </button>
        </div>
        <nav aria-label={t("konspekt.contents")} className="flex-1 overflow-y-auto px-2 pb-4">
          <ol className="flex flex-col">
            {sections.map((s, i) => {
              const on = s.id === selected;
              return (
                <li key={s.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex w-full items-baseline gap-2 rounded-lg py-2 pr-14 pl-4 text-left text-sm transition-colors",
                      on
                        ? "text-primary bg-primary-soft font-semibold"
                        : "text-foreground/80 hover:bg-surface-2",
                    )}
                  >
                    {on && (
                      <span
                        aria-hidden
                        className="bg-primary absolute top-2 bottom-2 left-1 w-[3px] rounded-full"
                      />
                    )}
                    <span className="text-muted w-5 shrink-0 text-right text-xs tabular-nums">
                      {i + 1}.
                    </span>
                    <span className="line-clamp-2">{s.title}</span>
                  </button>
                  <span className="absolute top-1.5 right-1 hidden gap-0.5 group-focus-within:flex group-hover:flex">
                    <button
                      onClick={() => move(s.id, -1)}
                      className="text-muted hover:text-foreground rounded p-1"
                      aria-label={t("konspekt.moveUp")}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      onClick={() => move(s.id, 1)}
                      className="text-muted hover:text-foreground rounded p-1"
                      aria-label={t("konspekt.moveDown")}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={add}>
            <Plus /> {t("konspekt.addChapter")}
          </Button>
        </nav>
      </aside>

      {/* Chapter */}
      <section className="min-w-0 px-4 py-8 sm:px-10 lg:px-16">
        {!current ? (
          <EmptyState
            hue="violet"
            icon={<ScrollText />}
            title={t("konspekt.emptyTitle")}
            body={t("konspekt.emptyBody")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={add}>
                  <Plus /> {t("konspekt.addChapter")}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/assistant">
                    <Sparkles /> {t("konspekt.askAi")}
                  </Link>
                </Button>
              </div>
            }
          />
        ) : (
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 flex items-center justify-between gap-3">
              <span aria-hidden className="bg-primary block h-1.5 w-16 rounded-full" />
              <div className="text-muted flex items-center gap-3 text-xs">
                <span>{t("konspekt.words", { count: words })}</span>
                <span className="inline-flex items-center gap-1" aria-live="polite">
                  {state === "saving" ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> {t("konspekt.saving")}
                    </>
                  ) : state === "saved" ? (
                    <>
                      <Check className="text-success size-3" /> {t("konspekt.saved")}
                    </>
                  ) : state === "dirty" ? (
                    t("konspekt.unsaved")
                  ) : null}
                </span>
                <ConfirmButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("konspekt.deleteChapter")}
                  message={t("konspekt.deleteConfirm")}
                  onConfirm={() => remove(current.id)}
                >
                  <Trash2 />
                </ConfirmButton>
              </div>
            </div>
            <input
              value={current.title}
              onChange={(e) => update({ title: e.target.value })}
              aria-label={t("konspekt.chapterTitle")}
              className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none sm:text-4xl"
            />
            <div className="text-muted mt-3 flex items-center gap-2 text-sm">
              <span>{t("konspekt.pages")}:</span>
              <input
                type="number"
                min={0}
                value={current.pageFrom ?? ""}
                onChange={(e) =>
                  update({ pageFrom: e.target.value ? Number(e.target.value) : null })
                }
                className="border-border w-20 rounded-md border bg-transparent px-2 py-1 text-sm"
                aria-label={t("notes.pageFrom")}
              />
              —
              <input
                type="number"
                min={0}
                value={current.pageTo ?? ""}
                onChange={(e) => update({ pageTo: e.target.value ? Number(e.target.value) : null })}
                className="border-border w-20 rounded-md border bg-transparent px-2 py-1 text-sm"
                aria-label={t("notes.pageTo")}
              />
            </div>
            <textarea
              key={current.id}
              value={current.content}
              onChange={(e) => {
                update({ content: e.target.value });
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
                }
              }}
              placeholder={t("konspekt.write")}
              aria-label={current.title}
              className="placeholder:text-muted/70 mt-8 w-full resize-none bg-transparent text-[17px] leading-[1.85] outline-none"
            />
          </div>
        )}
      </section>
    </div>
  );
}

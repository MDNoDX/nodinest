"use client";
import {
  BookHeart,
  BookOpen,
  Feather,
  Lightbulb,
  Map,
  MessageCircleQuestion,
  Mic,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createOwnBookAction, deleteOwnBookAction } from "@/app/actions/books";
import { Cover } from "@/components/library/cover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { BOOK_TEMPLATES, type BookTemplate } from "@/lib/book-templates";
import { useAction } from "@/lib/use-action";
import { StorageHint } from "./storage-hint";

type Book = {
  id: string;
  title: string;
  subtitle: string | null;
  template: string;
  goalWords: number | null;
  words: number;
  chapters: number;
  updatedAt: string;
};

const ICON: Record<BookTemplate, typeof BookOpen> = {
  memoir: BookHeart,
  family: Users,
  knowledge: Lightbulb,
  stories: Feather,
  travel: Map,
  blank: BookOpen,
};

/** "Kitob yozish": inspiration, templates and the user's own books. */
export function WriteHome({
  books,
  author,
  storage,
}: {
  books: Book[];
  author: string;
  storage: { used: number; quota: number } | null;
}) {
  const t = useTranslations("write");
  const router = useRouter();
  const { pending, exec } = useAction();
  const [open, setOpen] = useState<BookTemplate | null>(null);
  const [v, setV] = useState({ title: "", subtitle: "", goal: "" });

  const start = (tpl: BookTemplate) => {
    setV({ title: t(`tpl.${tpl}.title`), subtitle: "", goal: "" });
    setOpen(tpl);
  };

  return (
    <div className="flex flex-col gap-8">
      {storage && <StorageHint {...storage} />}
      {/* Why write — a gentle invitation, the memoir first. */}
      <section className="card relative overflow-hidden p-6">
        <div className="max-w-2xl">
          <h2 className="font-serif text-2xl leading-snug font-semibold">{t("heroTitle")}</h2>
          <p className="text-muted mt-2 leading-relaxed">{t("heroBody")}</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <li className="flex items-start gap-2">
              <Mic className="text-primary mt-0.5 size-4 shrink-0" /> {t("tipVoice")}
            </li>
            <li className="flex items-start gap-2">
              <MessageCircleQuestion className="text-primary mt-0.5 size-4 shrink-0" />{" "}
              {t("tipInterview")}
            </li>
            <li className="flex items-start gap-2">
              <BookOpen className="text-primary mt-0.5 size-4 shrink-0" /> {t("tipExport")}
            </li>
          </ul>
          <Button className="mt-5" onClick={() => start("memoir")}>
            <BookHeart /> {t("startMemoir")}
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("newBook")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BOOK_TEMPLATES.map((tpl) => {
            const Icon = ICON[tpl];
            return (
              <li key={tpl}>
                <button
                  type="button"
                  onClick={() => start(tpl)}
                  className="card hover:border-border-strong flex h-full w-full items-start gap-3 p-4 text-left transition-colors"
                >
                  <span className="bg-primary-soft text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{t(`tpl.${tpl}.name`)}</span>
                    <span className="text-muted mt-0.5 block text-sm">{t(`tpl.${tpl}.desc`)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("myBooks")}</h2>
        {books.length === 0 ? (
          <p className="text-muted text-sm">{t("noBooks")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((b) => (
              <li key={b.id} className="group relative">
                <Link href={`/write/${b.id}`} className="block">
                  <Cover
                    type="book"
                    title={b.title}
                    author={author}
                    src={null}
                    className="aspect-[2/3] h-auto w-full transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md"
                  />
                  <div className="mt-2 line-clamp-2 text-sm font-medium">{b.title}</div>
                  <div className="text-muted text-xs">
                    {t("bookStats", { words: b.words, chapters: b.chapters })}
                  </div>
                  {b.goalWords ? (
                    <div className="bg-surface-2 mt-1.5 h-1 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${Math.min(100, (b.words / b.goalWords) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(t("deleteConfirm", { title: b.title }))) return;
                    exec(() => deleteOwnBookAction(b.id));
                  }}
                  className="bg-surface/90 text-muted hover:text-danger absolute top-2 right-2 rounded-md p-1 opacity-0 shadow-sm group-hover:opacity-100 focus:opacity-100"
                  aria-label={t("delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={t("createTitle")} closeLabel={t("close")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!open) return;
              const goal = Number(v.goal);
              exec(
                () =>
                  createOwnBookAction({
                    title: v.title,
                    subtitle: v.subtitle || null,
                    template: open,
                    goalWords: Number.isInteger(goal) && goal >= 100 ? goal : null,
                  }),
                {
                  onSuccess: (id) => {
                    setOpen(null);
                    router.push(`/write/${id}`);
                  },
                  refresh: false,
                },
              );
            }}
          >
            {open && (
              <p className="bg-surface-2 text-muted rounded-lg px-3 py-2 text-sm">
                {t(`tpl.${open}.desc`)}
              </p>
            )}
            <Field label={t("bookTitle")}>
              {(p) => (
                <Input
                  {...p}
                  required
                  autoFocus
                  maxLength={300}
                  value={v.title}
                  onChange={(e) => setV({ ...v, title: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("bookSubtitle")} optional>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={v.subtitle}
                  onChange={(e) => setV({ ...v, subtitle: e.target.value })}
                />
              )}
            </Field>
            <Field label={t("goal")} optional>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={100}
                  step={100}
                  inputMode="numeric"
                  placeholder="30000"
                  value={v.goal}
                  onChange={(e) => setV({ ...v, goal: e.target.value })}
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" loading={pending} disabled={!v.title.trim()}>
                <Plus /> {t("create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

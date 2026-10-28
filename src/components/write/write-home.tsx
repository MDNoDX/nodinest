"use client";
import {
  ArrowRight,
  BookHeart,
  BookOpen,
  Feather,
  Lightbulb,
  Map,
  MessageCircleQuestion,
  Mic,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { createOwnBookAction, deleteOwnBookAction, updateOwnBookAction } from "@/app/actions/books";
import { Cover } from "@/components/library/cover";
import { todayWords } from "@/components/taqriz/taqriz-store";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
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

const noSubscribe = () => () => {};
/** Words written today (kept on this device by the editor); 0 on the server. */
function useToday(id: string, words: number) {
  return useSyncExternalStore(
    noSubscribe,
    () => todayWords(id, words, false),
    () => 0,
  );
}

type Form = { title: string; subtitle: string; goal: string };

/** "Kitob yozish": continue the last book, start a new one, and the shelf. */
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
  // New book (template) or editing an existing one (book id).
  const [form, setForm] = useState<{ tpl?: BookTemplate; edit?: Book } | null>(null);
  const [v, setV] = useState<Form>({ title: "", subtitle: "", goal: "" });
  const last = books[0];

  const start = (tpl: BookTemplate) => {
    setV({ title: t(`tpl.${tpl}.title`), subtitle: "", goal: "" });
    setForm({ tpl });
  };
  const edit = (b: Book) => {
    setV({
      title: b.title,
      subtitle: b.subtitle ?? "",
      goal: b.goalWords ? String(b.goalWords) : "",
    });
    setForm({ edit: b });
  };

  return (
    <div className="flex flex-col gap-8">
      {storage && <StorageHint {...storage} />}

      {last ? (
        <Continue book={last} author={author} />
      ) : (
        <Welcome onStart={() => start("memoir")} />
      )}

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
              <li key={b.id} className="relative">
                <Link href={`/write/${b.id}`} className="group block">
                  <Cover
                    type="book"
                    title={b.title}
                    author={author}
                    src={null}
                    className="aspect-[2/3] h-auto w-full transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md"
                  />
                  <div className="mt-2 line-clamp-2 pr-7 text-sm font-medium">{b.title}</div>
                  <div className="text-muted text-xs">
                    {t("bookStats", { words: b.words, chapters: b.chapters })}
                  </div>
                  {b.goalWords ? <Progress words={b.words} goal={b.goalWords} /> : null}
                </Link>
                <BookMenu
                  book={b}
                  onEdit={() => edit(b)}
                  onDelete={() => exec(() => deleteOwnBookAction(b.id))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent
          title={form?.edit ? t("editTitle") : t("createTitle")}
          closeLabel={t("close")}
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form) return;
              const goal = Number(v.goal);
              const goalWords = Number.isInteger(goal) && goal >= 100 ? goal : null;
              if (form.edit) {
                const id = form.edit.id;
                exec(
                  () =>
                    updateOwnBookAction(id, {
                      title: v.title,
                      subtitle: v.subtitle || null,
                      goalWords,
                    }),
                  { onSuccess: () => setForm(null) },
                );
                return;
              }
              const tpl = form.tpl ?? "blank";
              exec(
                () =>
                  createOwnBookAction({
                    title: v.title,
                    subtitle: v.subtitle || null,
                    template: tpl,
                    goalWords,
                  }),
                {
                  onSuccess: (id) => {
                    setForm(null);
                    router.push(`/write/${id}`);
                  },
                  refresh: false,
                },
              );
            }}
          >
            {form?.tpl && (
              <p className="bg-surface-2 text-muted rounded-lg px-3 py-2 text-sm">
                {t(`tpl.${form.tpl}.desc`)}
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
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" loading={pending} disabled={!v.title.trim()}>
                {form?.edit ? (
                  t("save")
                ) : (
                  <>
                    <Plus /> {t("create")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Progress({ words, goal }: { words: number; goal: number }) {
  return (
    <div className="bg-surface-2 mt-1.5 h-1 overflow-hidden rounded-full">
      <div
        className="bg-primary h-full rounded-full"
        style={{ width: `${Math.min(100, (words / goal) * 100)}%` }}
      />
    </div>
  );
}

/** For a newcomer: why write, how it works, one big button. */
function Welcome({ onStart }: { onStart: () => void }) {
  const t = useTranslations("write");
  return (
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
        <Button className="mt-5" size="lg" onClick={onStart}>
          <BookHeart /> {t("startMemoir")}
        </Button>
      </div>
      <ol className="border-border mt-6 grid gap-3 border-t pt-5 text-sm sm:grid-cols-3">
        {(["how1", "how2", "how3"] as const).map((k, i) => (
          <li key={k} className="flex gap-2.5">
            <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              {i + 1}
            </span>
            <span className="text-muted leading-snug">{t(k)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The last book, one tap from writing again. */
function Continue({ book, author }: { book: Book; author: string }) {
  const t = useTranslations("write");
  const locale = useLocale();
  const today = useToday(book.id, book.words);
  const left = book.goalWords ? Math.max(0, book.goalWords - book.words) : null;
  return (
    <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
      <Link href={`/write/${book.id}`} className="w-28 shrink-0 self-center sm:self-auto">
        <Cover
          type="book"
          title={book.title}
          author={author}
          src={null}
          className="aspect-[2/3] h-auto w-full shadow-md"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          {t("lastEdited")}
        </p>
        <h2 className="mt-1 font-serif text-2xl leading-tight font-semibold">{book.title}</h2>
        <p className="text-muted mt-1 text-sm">
          {t("bookStats", { words: book.words, chapters: book.chapters })} ·{" "}
          {t("updated", {
            date: new Date(book.updatedAt).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
            }),
          })}
          {today > 0 && (
            <span className="font-medium text-[var(--c-emerald)]">
              {" "}
              · {t("todayWords", { n: today })}
            </span>
          )}
        </p>
        {book.goalWords ? (
          <div className="mt-3 max-w-md">
            <Progress words={book.words} goal={book.goalWords} />
            <p className="text-muted mt-1 text-xs">
              {left ? t("goalLeft", { n: left }) : t("goalDone")}
            </p>
          </div>
        ) : null}
        <Button asChild size="lg" className="mt-4">
          <Link href={`/write/${book.id}`}>
            <Pencil /> {t("continue")} <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** Edit details / delete under a book (visible on touch screens too). */
function BookMenu({
  book,
  onEdit,
  onDelete,
}: {
  book: Book;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("write");
  return (
    <div className="absolute right-0 bottom-9 flex items-center gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        className="text-muted hover:text-foreground hover:bg-surface-2 grid size-7 place-items-center rounded-md"
        aria-label={t("edit")}
        title={t("edit")}
      >
        <Pencil className="size-3.5" />
      </button>
      <ConfirmButton
        variant="ghost"
        size="sm"
        className="text-muted hover:text-danger size-7 p-0"
        aria-label={t("delete")}
        message={t("deleteConfirm", { title: book.title })}
        confirmLabel={t("delete")}
        onConfirm={onDelete}
      >
        <Trash2 className="size-4" />
      </ConfirmButton>
    </div>
  );
}

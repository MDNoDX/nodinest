"use client";
/**
 * The app's own question window, in the middle of the screen, instead of the
 * browser's grey `confirm()` / `alert()` ("nodinest.vercel.app says…").
 * Call `ask({ message })` anywhere on the client; it resolves to true / false.
 * `AskHost` is mounted once in the root layout.
 */
import { AlertTriangle, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as D } from "radix-ui";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

type Question = {
  message: React.ReactNode;
  title?: React.ReactNode;
  /** The button that goes on (default "Confirm"; "OK" for a notice). */
  confirmLabel?: string;
  /** A red button for something that cannot be undone (default true). */
  danger?: boolean;
  /** Only an "OK" button: a message, not a question. */
  notice?: boolean;
  /** Something is deleted: the button says "Delete". */
  remove?: boolean;
};

type Open = Question & { id: number; done: (yes: boolean) => void };

let current: Open | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Asks in the app's own window; true when the person agreed. */
export function ask(q: Question): Promise<boolean> {
  // A question still open is answered "no" before the new one shows.
  current?.done(false);
  return new Promise((resolve) => {
    const id = ++seq;
    current = {
      ...q,
      id,
      done: (yes) => {
        if (current?.id === id) {
          current = null;
          emit();
        }
        resolve(yes);
      },
    };
    emit();
  });
}

/** A message with one "OK" (the app's own `alert()`). */
export function tell(message: React.ReactNode, title?: React.ReactNode) {
  return ask({ message, title, notice: true, danger: false }).then(() => undefined);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function AskHost() {
  const t = useTranslations("common");
  const q = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const danger = q ? (q.danger ?? true) && !q.notice : false;
  return (
    <D.Root open={!!q} onOpenChange={(o) => !o && q?.done(false)}>
      <D.Portal>
        <D.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px]" />
        <D.Content
          // A phone's Enter / the computer's Enter agrees, Esc says no.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)
              ?.querySelector<HTMLButtonElement>("[data-ask-yes]")
              ?.focus();
          }}
          className="border-border bg-surface data-[state=open]:animate-scale-in fixed top-1/2 left-1/2 z-[90] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border p-6 text-center shadow-2xl outline-none"
        >
          {q && (
            <>
              <span
                className={cn(
                  "mx-auto mb-3 grid size-12 place-items-center rounded-2xl",
                  danger ? "bg-danger/10 text-danger" : "bg-primary-soft text-primary",
                )}
              >
                {danger ? <AlertTriangle className="size-6" /> : <Info className="size-6" />}
              </span>
              <D.Title className="text-base font-semibold text-balance">
                {q.title ?? q.message}
              </D.Title>
              <D.Description
                className={
                  q.title ? "text-muted mt-1.5 text-sm text-balance whitespace-pre-line" : "sr-only"
                }
              >
                {q.message}
              </D.Description>
              <div className="mt-6 flex gap-2">
                {!q.notice && (
                  <Button variant="outline" className="flex-1" onClick={() => q.done(false)}>
                    {t("cancel")}
                  </Button>
                )}
                <Button
                  data-ask-yes
                  variant={danger ? "danger" : "primary"}
                  className="flex-1"
                  onClick={() => q.done(true)}
                >
                  {q.confirmLabel ?? t(q.notice ? "ok" : q.remove ? "delete" : "confirm")}
                </Button>
              </div>
            </>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

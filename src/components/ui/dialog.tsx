"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  closeLabel = "Close",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  closeLabel?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          "border-border bg-surface data-[state=open]:animate-scale-in fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="font-serif text-lg font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="text-muted mt-1 text-sm">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="text-muted hover:bg-surface-2 hover:text-foreground -m-1 rounded-md p-1"
            aria-label={closeLabel}
          >
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

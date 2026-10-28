"use client";
import { cn } from "@/lib/cn";

/** A toolbar button of the taqriz editor (keeps the editor's selection). */
export function Tool({
  on,
  label,
  onClick,
  disabled,
  children,
}: {
  on?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md transition-colors disabled:opacity-35",
        on ? "bg-primary-soft text-primary" : "text-foreground/75 hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

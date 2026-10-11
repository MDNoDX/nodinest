import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const base =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-muted/80 transition-colors focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(base, "h-10", className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(base, "min-h-20 py-2 leading-relaxed", className)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          base,
          "h-10 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
          "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2378857c%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

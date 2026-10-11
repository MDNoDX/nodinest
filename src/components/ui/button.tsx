import { Slot } from "radix-ui";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "link";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
  secondary: "bg-surface-2 text-foreground hover:bg-surface-3",
  ghost: "text-foreground hover:bg-surface-2",
  outline: "border border-border-strong bg-surface text-foreground hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90 dark:text-[#1a0d0c]",
  link: "text-primary underline-offset-4 hover:underline px-0 h-auto",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <span
              aria-hidden
              className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
          )}
          {children}
        </>
      )}
    </Comp>
  );
});

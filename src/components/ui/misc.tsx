import Link from "next/link";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({
  title,
  action,
  description,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-foreground text-sm font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-muted mt-0.5 text-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-muted mb-1 text-xs font-medium tracking-wide uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-foreground font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="text-muted mt-1.5 max-w-2xl text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border-strong flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="text-muted mb-3 [&_svg]:size-8">{icon}</div>}
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      {body && <p className="text-muted mt-1 max-w-md text-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function Pagination({
  page,
  total,
  pageSize,
  hrefFor,
  labels,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefFor: (p: number) => string;
  labels: { previous: string; next: string; page: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link
          className="border-border-strong hover:bg-surface-2 rounded-lg border px-3 py-1.5"
          href={hrefFor(page - 1)}
        >
          {labels.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">{labels.page}</span>
      {page < pages ? (
        <Link
          className="border-border-strong hover:bg-surface-2 rounded-lg border px-3 py-1.5"
          href={hrefFor(page + 1)}
        >
          {labels.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-muted text-xs font-medium">{label}</div>
      <div className="mt-1 font-serif text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {hint && <div className="text-muted mt-0.5 text-xs">{hint}</div>}
    </div>
  );
}

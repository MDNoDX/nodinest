import Link from "next/link";
import { cn } from "@/lib/cn";
import { hueStyle, TYPE_HUE, type Hue } from "@/lib/hues";
import { NAV_INNER, NAV_PRIMARY, NAV_SECONDARY } from "@/components/layout/nav-items";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

/** Small rounded square with a coloured icon (identity colour). */
export function IconChip({
  icon,
  hue,
  className,
}: {
  icon: React.ReactNode;
  hue: Hue;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={hueStyle(hue)}
      className={cn(
        "chip grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
        className,
      )}
    >
      {icon}
    </span>
  );
}

export function CardHeader({
  title,
  action,
  description,
  className,
  icon,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  /** Kept for callers; headers use the one accent colour now. */
  hue?: Hue;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {/* One calm accent everywhere; colour is kept for status and data. */}
        {icon && <IconChip icon={icon} hue="blue" className="size-7 rounded-md" />}
        <div className="min-w-0">
          <h2 className="text-foreground text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-muted mt-0.5 text-xs">{description}</p>}
        </div>
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

/** Badge coloured by an identity hue (e.g. resource type, tag). */
export function HueBadge({
  hue,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { hue: Hue }) {
  return (
    <span
      style={hueStyle(hue)}
      className={cn(
        "chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function TypeBadge({
  type,
  label,
  className,
}: {
  type: string;
  label: string;
  className?: string;
}) {
  return (
    <HueBadge hue={TYPE_HUE[type] ?? "slate"} className={className}>
      {label}
    </HueBadge>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  icon,
  hue,
  section,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  hue?: Hue;
  /** Nav key: picks the section's icon and colour. */
  section?: string;
}) {
  if (section) {
    const nav = [...NAV_PRIMARY, ...NAV_SECONDARY, ...NAV_INNER].find((n) => n.key === section);
    if (nav && !icon) {
      const Icon = nav.icon;
      icon = <Icon />;
    }
  }
  hue = "blue";
  return (
    <header className="mb-7 flex flex-col gap-4 pt-1 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <IconChip icon={icon} hue={hue} className="mt-0.5 size-11 rounded-xl [&_svg]:size-5" />
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-muted mb-1 text-xs font-medium tracking-wide uppercase">
              {eyebrow}
            </div>
          )}
          <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-[1.9rem]">
            {title}
          </h1>
          {subtitle && <p className="text-muted mt-1.5 max-w-2xl text-sm">{subtitle}</p>}
        </div>
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
  hue = "blue",
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  hue?: Hue;
}) {
  return (
    <div
      style={hueStyle(hue)}
      className={cn(
        "hue-soft hue-border flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <IconChip icon={icon} hue={hue} className="mb-4 size-14 rounded-2xl [&_svg]:size-7" />
      )}
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
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
          className="border-border-strong bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5"
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
          className="border-border-strong bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5"
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
  icon,
  hue = "blue",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  hue?: Hue;
}) {
  return (
    <div className="card relative overflow-hidden px-4 py-4" style={hueStyle(hue)}>
      <span aria-hidden className="hue-bar absolute inset-x-0 top-0 h-1 opacity-80" />
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted text-xs font-medium">{label}</div>
        {/* One calm accent everywhere; colour is kept for status and data. */}
        {icon && <IconChip icon={icon} hue="blue" className="size-7 rounded-md" />}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="text-muted mt-0.5 text-xs">{hint}</div>}
    </div>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { cn } from "@/lib/cn";

/** Accessible label + control + hint + error wrapper. */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string[] | string | null;
  optional?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => React.ReactNode;
}) {
  const id = useId();
  const t = useTranslations();
  const errors = (Array.isArray(error) ? error : error ? [error] : []).map((e) =>
    t.has(`validation.${e}`) ? t(`validation.${e}`) : t("validation.generic"),
  );
  const describedBy =
    [hint ? `${id}-hint` : null, errors.length ? `${id}-err` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
        {optional && <span className="text-muted ml-1 font-normal">({t("common.optional")})</span>}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": errors.length ? true : undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {errors.length > 0 && (
        <p id={`${id}-err`} role="alert" className="text-danger text-xs font-medium">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}

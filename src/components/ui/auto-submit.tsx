"use client";
import { useRef } from "react";

/** GET filter form that submits when a select/checkbox changes (works without JS too). */
export function AutoSubmitForm({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      method="get"
      action={action}
      className={className}
      onChange={(e) => {
        const el = e.target as HTMLElement;
        if (el.tagName === "SELECT" || (el as HTMLInputElement).type === "checkbox")
          ref.current?.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

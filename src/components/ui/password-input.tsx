"use client";
import { Check, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { PASSWORD_RULES, type PasswordRule } from "@/lib/password";

/** A password field with an eye to show / hide it. */
export function PasswordInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const t = useTranslations("auth");
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("hidePassword") : t("showPassword")}
        aria-pressed={show}
        className="text-muted hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** The rules, ticking off while the password is typed. */
export function PasswordRules({ value }: { value: string }) {
  const t = useTranslations("auth");
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {(Object.keys(PASSWORD_RULES) as PasswordRule[]).map((k) => {
        const ok = PASSWORD_RULES[k](value);
        return (
          <li
            key={k}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              ok ? "text-[var(--c-emerald)]" : "text-muted",
            )}
          >
            <Check
              className={cn("size-3.5 transition-opacity", ok ? "opacity-100" : "opacity-30")}
            />
            {t(`rule_${k}`)}
          </li>
        );
      })}
    </ul>
  );
}

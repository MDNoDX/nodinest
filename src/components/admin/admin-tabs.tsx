"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function AdminTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="border-border mb-6 flex gap-1 overflow-x-auto border-b" aria-label="Admin">
      {tabs.map((t) => {
        const active =
          t.href === "/admin" ? path === "/admin" : path.startsWith(t.href.split("?")[0]);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              active
                ? "border-primary text-primary"
                : "text-muted hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

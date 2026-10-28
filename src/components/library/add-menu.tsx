"use client";
import { Brain, ChevronDown, Plus, Quote, StickyNote } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DropdownMenu as M } from "radix-ui";
import { Button } from "@/components/ui/button";

/** The resource page's "Add…" menu: a quote, a note, study questions. */
export function AddMenu({ resourceId }: { resourceId: string }) {
  const t = useTranslations("resource");
  const items = [
    {
      href: `/notes/new?resource=${resourceId}&kind=quote`,
      icon: Quote,
      label: t("addQuote"),
      hue: "var(--c-violet)",
    },
    {
      href: `/notes/new?resource=${resourceId}`,
      icon: StickyNote,
      label: t("addNote"),
      hue: "var(--c-amber)",
    },
    {
      href: `/review?resource=${resourceId}`,
      icon: Brain,
      label: t("makeQuestions"),
      hue: "var(--c-teal)",
    },
  ];
  return (
    <M.Root>
      <M.Trigger asChild>
        <Button variant="outline">
          <Plus /> {t("addMenu")} <ChevronDown className="opacity-60" />
        </Button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="start"
          sideOffset={6}
          className="border-border bg-surface animate-scale-in z-50 w-60 rounded-xl border p-1.5 shadow-xl"
        >
          {items.map(({ href, icon: Icon, label, hue }) => (
            <M.Item key={href} asChild>
              <Link
                href={href}
                className="data-[highlighted]:bg-surface-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none"
              >
                <Icon className="size-4" style={{ color: hue }} /> {label}
              </Link>
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

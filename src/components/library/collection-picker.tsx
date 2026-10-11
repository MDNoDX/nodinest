"use client";
import { Check, FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DropdownMenu as M } from "radix-ui";
import { toggleCollectionItemAction } from "@/app/actions/personal";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

export function CollectionPicker({
  collections,
  selected,
  target,
}: {
  collections: { id: string; name: string | null; systemKey: string | null }[];
  selected: string[];
  target: { resourceId?: string; noteId?: string };
}) {
  const t = useTranslations();
  const { pending, exec } = useAction();
  return (
    <M.Root>
      <M.Trigger asChild>
        <Button variant="outline" size="sm" loading={pending}>
          <FolderPlus /> {t("resource.addToCollection")}
        </Button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="start"
          sideOffset={6}
          className="border-border bg-surface animate-scale-in z-50 w-60 rounded-xl border p-1.5 shadow-xl"
        >
          {collections.map((c) => {
            const on = selected.includes(c.id);
            const name = c.name ?? (c.systemKey ? t(`collections.system.${c.systemKey}`) : "");
            return (
              <M.CheckboxItem
                key={c.id}
                checked={on}
                onSelect={(e) => {
                  e.preventDefault();
                  exec(() => toggleCollectionItemAction(c.id, target, !on), {
                    success: on ? t("collections.removed") : t("collections.added"),
                  });
                }}
                className="data-[highlighted]:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none"
              >
                <span className="border-border-strong grid size-4 place-items-center rounded border">
                  {on && <Check className="text-primary size-3" />}
                </span>
                <span className="truncate">{name}</span>
              </M.CheckboxItem>
            );
          })}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

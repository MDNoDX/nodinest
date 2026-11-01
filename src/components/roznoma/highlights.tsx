"use client";
import { GripVertical, Pencil, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useDragOrder } from "@/lib/use-drag-order";

/** What to remember of the day: added, changed, removed, and put in order by holding one. */
export function Highlights({
  value,
  onChange,
}: {
  value: string[];
  onChange: (list: string[]) => void;
}) {
  const t = useTranslations("roznoma");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const rows = value.map((h, i) => ({ h, i }));
  const { list, shown, dragged, start, swallowClick } = useDragOrder(
    rows,
    (r) => String(r.i),
    (keys) => onChange(keys.map((k) => value[Number(k)])),
  );
  const finish = () => {
    if (editing == null) return;
    const v = text.trim();
    onChange(
      v ? value.map((h, k) => (k === editing ? v : h)) : value.filter((_, k) => k !== editing),
    );
    setEditing(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">📌 {t("highlights")}</span>
      {value.length > 0 && (
        <ul ref={list as React.RefObject<HTMLUListElement>} className="flex flex-col gap-1">
          {shown.map((r, pos) => (
            <li
              key={r.i}
              onPointerDown={(e) => editing == null && start(e, pos)}
              onClickCapture={(e) => {
                if (swallowClick.current) {
                  swallowClick.current = false;
                  e.stopPropagation();
                }
              }}
              className={cn(
                "bg-surface-2 flex touch-pan-y items-center gap-2 rounded-lg px-2 py-1.5 text-sm select-none",
                dragged === String(r.i) && "ring-primary/50 shadow-md ring-2",
              )}
            >
              {editing === r.i ? (
                <Input
                  autoFocus
                  className="h-8 flex-1"
                  maxLength={300}
                  value={text}
                  aria-label={t("highlights")}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={finish}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <>
                  <GripVertical className="text-muted size-4 shrink-0 cursor-grab" aria-hidden />
                  <span className="min-w-0 flex-1 break-words">{r.h}</span>
                  <button
                    type="button"
                    aria-label={t("editItem")}
                    title={t("editItem")}
                    className="text-muted hover:text-foreground p-0.5"
                    onClick={() => {
                      setText(r.h);
                      setEditing(r.i);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    title={t("delete")}
                    className="text-muted hover:text-danger p-0.5"
                    onClick={() => onChange(value.filter((_, k) => k !== r.i))}
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const h = draft.trim();
          if (!h) return;
          onChange([...value, h]);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          maxLength={300}
          placeholder={t("highlightPh")}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!draft.trim()} aria-label={t("add")}>
          <Plus />
        </Button>
      </form>
    </div>
  );
}

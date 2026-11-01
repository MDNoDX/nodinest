"use client";
import { FileDown } from "lucide-react";

/** Saves the page as a PDF (the browser's print dialog). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs font-medium print:hidden"
    >
      <FileDown className="size-3.5" /> {label}
    </button>
  );
}

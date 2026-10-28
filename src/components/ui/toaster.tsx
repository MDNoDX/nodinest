"use client";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      // Above the phone tab bar.
      mobileOffset={{ bottom: "calc(var(--bottom-nav, 0px) + 16px)" }}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!bg-surface !text-foreground !border-border !rounded-xl !shadow-lg",
          description: "!text-muted",
        },
      }}
    />
  );
}

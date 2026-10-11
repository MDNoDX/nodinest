"use client";
import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Persists the theme in localStorage ("nodinest-theme"), follows the system
 * preference by default, and injects a blocking script so the correct theme
 * is applied before first paint (no flash).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="nodinest-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}

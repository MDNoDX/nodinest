"use client";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

const noop = () => () => {};

/** Light / dark in the top bar: the new theme spreads from the button in a circle. */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={t(dark ? "light" : "dark")}
      title={t(dark ? "light" : "dark")}
      onClick={(e) => {
        const next = dark ? "light" : "dark";
        const view = document as Document & {
          startViewTransition?: (cb: () => void) => { ready: Promise<void> };
        };
        if (!view.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches)
          return setTheme(next);
        const { clientX: x, clientY: y } = e;
        const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        const vt = view.startViewTransition(() => flushSync(() => setTheme(next)));
        void vt.ready.then(() =>
          document.documentElement.animate(
            { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
            { duration: 500, easing: "ease-out", pseudoElement: "::view-transition-new(root)" },
          ),
        );
      }}
      className="text-muted hover:bg-surface-2 hover:text-foreground relative grid size-9 place-items-center rounded-lg transition-colors"
    >
      <Sun
        className={`absolute size-[18px] transition-all duration-500 ${dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"}`}
      />
      <Moon
        className={`absolute size-[18px] transition-all duration-500 ${dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`}
      />
    </button>
  );
}

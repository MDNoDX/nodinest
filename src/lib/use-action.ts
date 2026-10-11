"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "./errors";

/**
 * Runs a server action with consistent pending/success/error feedback.
 * Never reports success unless the server returned ok:true.
 */
export function useAction() {
  const te = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  function exec<T>(
    fn: () => Promise<ActionResult<T>>,
    opts: {
      success?: string;
      refresh?: boolean;
      onSuccess?: (data: T) => void;
      onError?: (r: Extract<ActionResult<T>, { ok: false }>) => boolean | void;
    } = {},
  ) {
    start(async () => {
      let r: ActionResult<T>;
      try {
        r = await fn();
      } catch {
        toast.error(te("INTERNAL"));
        return;
      }
      if (r.ok) {
        if (opts.success) toast.success(opts.success);
        opts.onSuccess?.(r.data);
        if (opts.refresh !== false) router.refresh();
      } else {
        const handled = opts.onError?.(r);
        if (!handled) toast.error(te(r.code));
        if (r.code === "SESSION_STATE") router.refresh();
      }
    });
  }
  return { pending, exec };
}

"use client";
import { useEffect } from "react";
import { syncTimezoneAction } from "@/app/actions/account";

/** Keeps the account's time zone equal to this device's (nothing to set by hand). */
export function TimezoneSync({ current }: { current: string }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) void syncTimezoneAction(tz);
  }, [current]);
  return null;
}

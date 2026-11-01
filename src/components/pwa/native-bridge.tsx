"use client";
import { useEffect } from "react";
import { isNativeApp, listenForSignIn, scheduleAlarms, type Alarm } from "@/lib/native";

/** Inside the installed app: sign-in links, and the week's alarms handed to the phone. */
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    listenForSignIn();
    void fetch("/api/roznoma/upcoming")
      .then((r) => (r.ok ? (r.json() as Promise<{ alarms: Alarm[] }>) : null))
      .then((d) => d && scheduleAlarms(d.alarms))
      .catch(() => {});
  }, []);
  return null;
}

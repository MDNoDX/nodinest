"use client";
/* eslint-disable @next/next/no-img-element */
import { createContext, useContext } from "react";
import { NO_ICONS, iconSrc, type PlanIconsCfg } from "@/lib/plan-icons";

const Icons = createContext<PlanIconsCfg>(NO_ICONS);

/** The owner's icon choices (Admin → Icons), given once by the signed-in layout. */
export function PlanIconsProvider({
  value,
  children,
}: {
  value: PlanIconsCfg;
  children: React.ReactNode;
}) {
  return <Icons.Provider value={value}>{children}</Icons.Provider>;
}

export const usePlanIcons = () => useContext(Icons);

/** The colour picture of a plan item: one of ours (maybe replaced by the owner), or one they added ("c:<id>"). */
export function PlanIcon({ name, className }: { name: string | null; className?: string }) {
  const cfg = usePlanIcons();
  return (
    <img
      src={iconSrc(name, cfg)}
      alt=""
      aria-hidden
      draggable={false}
      className={`plan-icon ${className ?? ""}`}
    />
  );
}

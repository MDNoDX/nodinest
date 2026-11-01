/* eslint-disable @next/next/no-img-element */
import { iconKey } from "@/lib/plan-icons";

/** The colour picture of a plan item: one of ours, or one the owner added ("c:<id>"). */
export function PlanIcon({ name, className }: { name: string | null; className?: string }) {
  const src = name?.startsWith("c:")
    ? `/api/plan-icons/${name.slice(2)}`
    : `/plan-icons/${iconKey(name)}.svg`;
  return <img src={src} alt="" aria-hidden className={className} />;
}

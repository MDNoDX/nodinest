import { CircleCheck } from "lucide-react";
import { PLAN_ICONS } from "@/lib/plan-icons";

/** The icon of a plan item (a plain tick when it has none). */
export function PlanIcon({ name, className }: { name: string | null; className?: string }) {
  const I = (name && PLAN_ICONS[name]) || CircleCheck;
  return <I className={className} aria-hidden />;
}

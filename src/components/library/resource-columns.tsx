"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Two columns and one card that goes where there is room: under the shorter
 * column, and it moves when notes or quotes make the other one longer. It only
 * changes its grid place, so what is inside (an upload in progress) goes on.
 */
export function ResourceColumns({
  main,
  side,
  extra,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLElement>(null);
  const [under, setUnder] = useState<"main" | "side">("main");
  useEffect(() => {
    const l = left.current;
    const r = right.current;
    if (!l || !r || !extra) return;
    const place = () => setUnder(l.offsetHeight > r.offsetHeight ? "side" : "main");
    place();
    const seen = new ResizeObserver(place);
    seen.observe(l);
    seen.observe(r);
    return () => seen.disconnect();
  }, [extra]);
  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:grid-rows-[auto_1fr] [&>*]:min-w-0">
      <div
        ref={left}
        className={cn(
          "flex flex-col gap-6 lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:self-start",
          under === "side" && "lg:row-span-2",
        )}
      >
        {main}
      </div>
      <aside
        ref={right}
        className={cn(
          "flex flex-col gap-6 lg:col-start-3 lg:row-start-1 lg:self-start",
          under === "main" && "lg:row-span-2",
        )}
      >
        {side}
      </aside>
      {extra && (
        <div
          className={cn(
            "lg:row-start-2 lg:self-start",
            under === "main" ? "lg:col-span-2 lg:col-start-1" : "lg:col-start-3",
          )}
        >
          {extra}
        </div>
      )}
    </div>
  );
}

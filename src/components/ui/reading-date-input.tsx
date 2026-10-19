"use client";
import { Clock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { parseReadingDate } from "@/lib/reading-date";
import { Button } from "./button";
import { DateParts } from "./date-parts";
import { Input } from "./input";

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Wire value → { date: partial "YYYY[-MM[-DD]]" in local time, time: "HH:MM" | "" }. */
function fromValue(v: string) {
  const r = parseReadingDate(v);
  if (!r) return { date: "", time: "" };
  if (r.precision !== "time") return { date: v, time: "" };
  return { date: localDay(r.at), time: localTime(r.at) };
}

function toValue(date: string, time: string) {
  if (time && /^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T${time}`).toISOString();
  return date;
}

/** Today's local calendar day ("YYYY-MM-DD"). */
export const todayValue = () => localDay(new Date());

/**
 * Start / finish date of a reading: year required, month, day and time
 * optional — enter exactly what you remember.
 */
export function ReadingDateInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations();
  const cur = fromValue(value);
  const [time, setTime] = useState(cur.time);
  const [showTime, setShowTime] = useState(Boolean(cur.time));
  const date = cur.date;
  const fullDay = /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <DateParts
          id={id}
          value={date}
          invalid={invalid}
          className="flex-1"
          onChange={(d) => onChange(toValue(d, showTime ? time : ""))}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted h-10 shrink-0 px-2"
            aria-label={t("record.clear")}
            onClick={() => {
              setTime("");
              setShowTime(false);
              onChange("");
            }}
          >
            <X className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 shrink-0 px-2.5"
            onClick={() => onChange(todayValue())}
          >
            {t("record.today")}
          </Button>
        )}
      </div>
      {fullDay &&
        (showTime ? (
          <div className="flex items-center gap-1.5">
            <Clock className="text-muted size-4" />
            <Input
              type="time"
              aria-label={t("dates.time")}
              className="w-28 px-2"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                onChange(toValue(date, e.target.value));
              }}
            />
            <button
              type="button"
              className="text-muted hover:text-foreground text-xs"
              onClick={() => {
                setTime("");
                setShowTime(false);
                onChange(date);
              }}
            >
              {t("dates.noTime")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-muted hover:text-foreground flex w-fit items-center gap-1 text-xs font-medium"
            onClick={() => {
              const now = localTime(new Date());
              setTime(now);
              setShowTime(true);
              onChange(toValue(date, now));
            }}
          >
            <Clock className="size-3.5" /> {t("dates.addTime")}
          </button>
        ))}
    </div>
  );
}

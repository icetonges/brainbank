"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface HeatmapDay {
  /** YYYY-MM-DD */
  date: string;
  count: number;
  /** Dominant life-area color for that day, if any. */
  color?: string;
}

/**
 * A GitHub-style contribution grid over diary entries — the fastest way to
 * see writing consistency and, because cells are tinted by that day's
 * dominant life area, what a stretch of weeks was actually *about*.
 *
 * Rendered client-side so cells can animate in and respond to hover
 * without a round trip. Weeks run as columns, days of week as rows.
 */
export function DiaryHeatmap({
  days,
  weeks = 26,
  lang = "en",
}: {
  days: HeatmapDay[];
  weeks?: number;
  lang?: string;
}) {
  const [hover, setHover] = useState<HeatmapDay | null>(null);

  const { columns, maxCount } = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const today = new Date();
    // Walk back to the most recent Sunday so every column is a full week.
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const cols: HeatmapDay[][] = [];
    let max = 0;
    for (let w = weeks - 1; w >= 0; w--) {
      const col: HeatmapDay[] = [];
      for (let d = 0; d < 7; d++) {
        const cell = new Date(end);
        cell.setDate(end.getDate() - w * 7 - (6 - d));
        const key = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(cell.getDate()).padStart(2, "0")}`;
        const found = byDate.get(key);
        const entry: HeatmapDay = found ?? { date: key, count: 0 };
        if (entry.count > max) max = entry.count;
        col.push(entry);
      }
      cols.push(col);
    }
    return { columns: cols, maxCount: max || 1 };
  }, [days, weeks]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((day) => {
              const intensity = day.count === 0 ? 0 : 0.25 + (day.count / maxCount) * 0.75;
              const future = new Date(day.date) > new Date();
              return (
                <Link
                  key={day.date}
                  href={day.count > 0 ? `/diary?date=${day.date}` : `/diary/new?date=${day.date}`}
                  onMouseEnter={() => setHover(day)}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`${day.date}: ${day.count}`}
                  className="h-[11px] w-[11px] rounded-[2px] transition-all duration-150 hover:scale-125 hover:ring-1 hover:ring-accent"
                  style={{
                    backgroundColor:
                      day.count === 0
                        ? "var(--color-border)"
                        : day.color ?? "var(--color-accent)",
                    opacity: future ? 0.15 : day.count === 0 ? 0.45 : intensity,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex h-4 items-center justify-between text-xs text-fg-secondary">
        <span>
          {hover
            ? `${hover.date} · ${hover.count} ${hover.count === 1 ? (lang === "zh" ? "篇" : "entry") : lang === "zh" ? "篇" : "entries"}`
            : ""}
        </span>
        <span className="flex items-center gap-1.5">
          {lang === "zh" ? "少" : "less"}
          {[0.2, 0.45, 0.7, 1].map((o) => (
            <span
              key={o}
              className="h-[10px] w-[10px] rounded-[2px]"
              style={{ backgroundColor: "var(--color-accent)", opacity: o }}
            />
          ))}
          {lang === "zh" ? "多" : "more"}
        </span>
      </div>
    </div>
  );
}

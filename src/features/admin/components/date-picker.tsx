"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const toYMD = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Today's calendar date in IST (UTC+5:30, no DST) — independent of where the admin is. */
function istToday(): { y: number; m: number; d: number } {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate() };
}

/** Parse a strict YYYY-MM-DD string; rejects impossible dates (e.g. 02-31). */
function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

/**
 * A date field you can BOTH type into (YYYY-MM-DD) and pick from a calendar.
 * Dependency-free; themed via CSS vars so it works in dark mode. The rendered
 * <input name> lets it submit inside a plain GET form. The string value is
 * interpreted as an IST calendar date downstream (see istDateRangeToUtc).
 */
export function DatePicker({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const parsed = parseYMD(value);
  const invalid = value.trim() !== "" && !parsed;

  const today = istToday();
  const initial = parsed ?? { y: today.y, m: today.m };
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  // When the typed value becomes a valid date, jump the calendar to its month.
  useEffect(() => {
    const p = parseYMD(value);
    if (p) setView({ y: p.y, m: p.m });
  }, [value]);

  // Close on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSelected = (d: number) =>
    parsed != null && parsed.y === view.y && parsed.m === view.m && parsed.d === d;
  const isToday = (d: number) =>
    today.y === view.y && today.m === view.m && today.d === d;

  const shiftMonth = (delta: number) => {
    const base = new Date(view.y, view.m + delta, 1);
    setView({ y: base.getFullYear(), m: base.getMonth() });
  };
  const pick = (d: number) => {
    onChange(toYMD(view.y, view.m, d));
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1" ref={wrapRef}>
      <label htmlFor={name} className="text-xs text-[var(--muted-foreground)]">
        {label}
      </label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="YYYY-MM-DD"
          value={value}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          className={cn("w-[170px] pr-9", invalid && "border-red-500 focus-visible:ring-red-500")}
        />
        <button
          type="button"
          aria-label={`Open calendar for ${label}`}
          onClick={() => setOpen((o) => !o)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>

        {open ? (
          <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[252px] rounded-md border bg-[var(--background)] p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}
                className="rounded px-2 py-1 text-sm hover:bg-[var(--muted)]"
              >
                ‹
              </button>
              <span className="text-sm font-medium">
                {MONTHS[view.m]} {view.y}
              </span>
              <button
                type="button" aria-label="Next month" onClick={() => shiftMonth(1)}
                className="rounded px-2 py-1 text-sm hover:bg-[var(--muted)]"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--muted-foreground)]">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) =>
                d === null ? (
                  <div key={`b-${view.y}-${view.m}-${i}`} />
                ) : (
                  <button
                    key={`${view.y}-${view.m}-${d}`}
                    type="button"
                    onClick={() => pick(d)}
                    className={cn(
                      "flex h-8 items-center justify-center rounded text-sm hover:bg-[var(--muted)]",
                      isSelected(d) && "bg-cyan-600 text-white hover:bg-cyan-600",
                      !isSelected(d) && isToday(d) && "border border-cyan-500",
                    )}
                  >
                    {d}
                  </button>
                ),
              )}
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  onChange(toYMD(today.y, today.m, today.d));
                  setOpen(false);
                }}
                className="text-cyan-600 hover:underline"
              >
                Today
              </button>
              {value ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-[var(--muted-foreground)] hover:underline"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IndustryLeakSpec } from "@/lib/marketing/industries";

/**
 * The industry leak calculator. Four inputs, rupees, and the working on screen.
 *
 * Two rules it exists to honour, both from the brief these pages were written to:
 *
 *  1. No number appears without its arithmetic. The working is printed under the
 *     result, line by line, with the visitor's own figures in it, so a sceptical
 *     operator can check it in their head instead of taking it on trust.
 *  2. The estimate is a FLOOR, and says so. It counts the minutes spent on the
 *     enquiry and nothing around them. A generous figure is one somebody can
 *     argue you down from; a conservative one survives the conversation.
 *
 * Labels, defaults and the floor note come from the spec rather than from here,
 * so the same component serves every industry page and the copy stays in one file.
 */
export function IndustryLeak({ spec }: { spec: IndustryLeakSpec }) {
  const [enquiries, setEnquiries] = useState(String(spec.enquiriesDefault));
  const [wrongFitPct, setWrongFitPct] = useState(String(spec.wrongFitDefault));
  const [minutes, setMinutes] = useState(String(spec.minutesDefault));
  const [rate, setRate] = useState(String(spec.rateDefault));

  const r = useMemo(() => {
    const n = (v: string) => {
      const x = Number(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(x) && x > 0 ? x : 0;
    };
    const count = n(enquiries);
    const pct = Math.min(n(wrongFitPct), 100);
    const mins = n(minutes);
    const hourly = n(rate);
    const wrongFit = (count * pct) / 100;
    const totalMinutes = wrongFit * mins;
    const hours = totalMinutes / 60;
    const perMonth = hours * hourly;
    return { count, pct, mins, hourly, wrongFit, totalMinutes, hours, perMonth, perYear: perMonth * 12 };
  }, [enquiries, wrongFitPct, minutes, rate]);

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-xl border p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="leak-enquiries" label={spec.enquiriesLabel}>
            <Input
              id="leak-enquiries"
              inputMode="numeric"
              value={enquiries}
              onChange={(e) => setEnquiries(e.target.value)}
            />
          </Field>
          <Field id="leak-pct" label={spec.wrongFitLabel} hint={spec.wrongFitHint}>
            <Input
              id="leak-pct"
              inputMode="numeric"
              value={wrongFitPct}
              onChange={(e) => setWrongFitPct(e.target.value)}
            />
          </Field>
          <Field id="leak-mins" label={spec.minutesLabel}>
            <Input
              id="leak-mins"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
          <Field id="leak-rate" label={spec.rateLabel} hint={spec.rateHint}>
            <Input
              id="leak-rate"
              inputMode="numeric"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
          What wrong-fit enquiries cost you
        </p>

        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          <Stat
            label={`Wrong-fit ${plural(spec.unit)} a month`}
            value={Math.round(r.wrongFit).toLocaleString("en-IN")}
          />
          <Stat label="Hours lost a month" value={r.hours.toFixed(1)} />
          <Stat label="Lost a month" value={rupees(r.perMonth)} />
        </div>

        <p className="mt-6 text-2xl font-bold sm:text-3xl">
          {rupees(r.perYear)}{" "}
          <span className="font-medium text-[var(--muted-foreground)]">a year</span>
        </p>
        {inWords(r.perYear) ? (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{inWords(r.perYear)}</p>
        ) : null}

        {/* The working. Every figure above, re-derived from the four inputs, in the
            order a person would do it with a calculator. */}
        <div className="mt-7 flex flex-col gap-1.5 border-t border-green-600/20 pt-5 text-sm text-[var(--muted-foreground)] sm:text-[0.95rem]">
          <Line>
            {num(r.count)} {plural(spec.unit)} × {num(r.pct)}% wrong fit ={" "}
            <strong className="font-semibold text-[var(--foreground)]">
              {num(Math.round(r.wrongFit))} {plural(spec.unit)}
            </strong>
          </Line>
          <Line>
            {num(Math.round(r.wrongFit))} × {num(r.mins)} minutes = {num(Math.round(r.totalMinutes))}{" "}
            minutes ={" "}
            <strong className="font-semibold text-[var(--foreground)]">{r.hours.toFixed(1)} hours</strong>
          </Line>
          <Line>
            {r.hours.toFixed(1)} hours × {rupees(r.hourly)} an hour ={" "}
            <strong className="font-semibold text-[var(--foreground)]">{rupees(r.perMonth)}</strong> a
            month
          </Line>
          <Line>
            {rupees(r.perMonth)} × 12 ={" "}
            <strong className="font-semibold text-[var(--foreground)]">{rupees(r.perYear)}</strong> a
            year
          </Line>
        </div>

        <p className="mt-6 text-sm text-[var(--muted-foreground)]">{spec.floorNote}</p>
      </div>
    </div>
  );
}

/** Rupees, Indian digit grouping, no paise. */
function rupees(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

/** Plain integers in the working, grouped the same way as the money. */
function num(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}

/**
 * The annual figure in lakh or crore, which is how the reader actually holds it.
 *
 * Returns an empty string below a lakh rather than writing "₹40,000 in words",
 * because at that size the digits are already the clearest form.
 */
function inWords(v: number): string {
  if (v >= 10000000) {
    const cr = v / 10000000;
    return `About ₹${cr.toFixed(cr < 10 ? 2 : 1)} crore a year.`;
  }
  if (v >= 100000) {
    const lakh = v / 100000;
    return `About ₹${lakh.toFixed(lakh < 10 ? 2 : 1)} lakh a year.`;
  }
  return "";
}

function plural(unit: string): string {
  return unit.endsWith("y") ? `${unit.slice(0, -1)}ies` : `${unit}s`;
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-sm text-[var(--muted-foreground)]">{hint}</p> : null}
      {children}
    </div>
  );
}

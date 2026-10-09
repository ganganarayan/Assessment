"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { DFY } from "@/lib/marketing/content";

/**
 * The wasted-call calculator. Ungated on purpose: no email to see the number.
 *
 * Gating it would be the exact behaviour this whole site argues against, and a visitor
 * who has to trade an address to find out what their own calendar costs them has already
 * learned something about us that we would rather they did not.
 *
 * 🔴 The arithmetic is deliberately CONSERVATIVE, and says so on the page. It counts the
 * call itself and nothing else: no preparation, no note-writing, no follow-up, no
 * rescheduling, no context switch. Those are real and they are not counted, because a
 * number somebody can argue with is worth nothing in a sales conversation, and the
 * honest floor is more persuasive than a generous estimate anybody can pick apart.
 */

const CURRENCIES = [
  { code: "USD", symbol: "$", step: 10 },
  { code: "INR", symbol: "₹", step: 500 },
] as const;

export function WastedCallCalculator() {
  const [calls, setCalls] = useState("40");
  const [wrongFitPct, setWrongFitPct] = useState("60");
  const [minutes, setMinutes] = useState("30");
  const [rate, setRate] = useState("100");
  const [cur, setCur] = useState<(typeof CURRENCIES)[number]>(CURRENCIES[0]);

  const r = useMemo(() => {
    const n = (v: string) => {
      const x = Number(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(x) && x > 0 ? x : 0;
    };
    const wrongFit = n(calls) * Math.min(n(wrongFitPct), 100) / 100;
    const hours = (wrongFit * n(minutes)) / 60;
    const perMonth = hours * n(rate);
    return { wrongFit, hours, perMonth, perYear: perMonth * 12 };
  }, [calls, wrongFitPct, minutes, rate]);

  const money = (v: number) =>
    `${cur.symbol}${Math.round(v).toLocaleString(cur.code === "INR" ? "en-IN" : "en-US")}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-xl border p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="text-sm text-[var(--muted-foreground)]">Currency</span>
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCur(c)}
              className={`rounded-md border px-3 py-1 text-sm ${
                c.code === cur.code ? "bg-green-600 font-medium text-white" : ""
              }`}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="calls" label="Calls booked per month">
            <Input id="calls" inputMode="numeric" value={calls} onChange={(e) => setCalls(e.target.value)} />
          </Field>
          <Field id="pct" label="Of those, what percent turn out wrong-fit?">
            <Input id="pct" inputMode="numeric" value={wrongFitPct} onChange={(e) => setWrongFitPct(e.target.value)} />
          </Field>
          <Field id="mins" label="Average call length, in minutes">
            <Input id="mins" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <Field
            id="rate"
            label={`Your hourly value, in ${cur.code}`}
            hint="Monthly revenue divided by hours worked, if you have never worked it out."
          >
            <Input id="rate" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
          What wrong-fit calls cost you
        </p>
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          <Stat label="Wrong-fit calls a month" value={Math.round(r.wrongFit).toLocaleString()} />
          <Stat label="Hours lost a month" value={r.hours.toFixed(1)} />
          <Stat label="Lost a month" value={money(r.perMonth)} />
        </div>
        <p className="mt-6 text-2xl font-bold sm:text-3xl">
          {money(r.perYear)} <span className="font-medium text-[var(--muted-foreground)]">a year</span>
        </p>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          That counts the call and nothing else. No preparation, no notes, no follow-up, no
          reschedules, and nothing for the context switch either side of it. The real figure is
          higher; this one is the floor, so nobody can argue you up from it.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          What a gate would have caught
        </h2>
        <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
          Most of it, and before the lead ever existed. A qualification gate runs before the
          opt-in: a visitor who cannot pay, is not deciding, or is twelve months away is routed
          to an exit page, and no lead record is created at all. Nothing to call, nothing to
          chase, nothing to clean out of the CRM in six months.
        </p>
        <ul className="mt-5 flex flex-col gap-2 leading-relaxed text-[var(--muted-foreground)]">
          <li>
            <strong className="text-[var(--foreground)]">The calls stop being booked.</strong>{" "}
            That is where the hours above come back.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Your ads stop buying more of them.</strong>{" "}
            The disqualified feed an exclusion audience, and only qualified completions report as
            a conversion, so the algorithm learns which half to chase.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">The people you do speak to arrive scored.</strong>{" "}
            You open the call already knowing where they stand.
          </li>
        </ul>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href={DFY.href} className={buttonVariants({ size: "lg" })}>
            {DFY.cta}
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            See how it works
          </Link>
        </div>
      </div>
    </div>
  );
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { QUALIFIED_COST } from "@/lib/marketing/content";
import { convertDefault, type Currency } from "@/lib/marketing/currency";
import { type CtaConfig } from "@/lib/settings/config";
import { CtaLink } from "./CtaLink";

/**
 * Cost per lead against cost per qualified call. Ungated, like the wasted-call
 * calculator: a visitor who has to trade an email to see their own arithmetic has
 * learned something about us we would rather they did not.
 *
 * The funnel is multiplicative and nothing more: leads x pick-up x fit x show. Every
 * output is spend divided by one of those counts, so the visitor can redo it on paper.
 *
 * Currency follows the industry pages: the server's country when Cloudflare supplied
 * one, otherwise the browser timezone, and the toggle always wins.
 */
const SYMBOL: Record<Currency, string> = { INR: "₹", USD: "$" };

export function QualifiedLeadCalculator({
  cta,
  currency: initialCurrency,
  currencyResolved,
}: {
  cta: CtaConfig;
  currency: Currency;
  currencyResolved: boolean;
}) {
  const d = QUALIFIED_COST.defaults;
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [chosen, setChosen] = useState(false);
  const [spend, setSpend] = useState(String(convertDefault(d.spendInr, initialCurrency)));
  const [leads, setLeads] = useState(String(d.leads));
  const [pickup, setPickup] = useState(String(d.pickupPct));
  const [fit, setFit] = useState(String(d.fitPct));
  const [show, setShow] = useState(String(d.showPct));

  function switchCurrency(next: Currency) {
    setCurrency(next);
    setSpend(String(convertDefault(d.spendInr, next)));
  }

  useEffect(() => {
    if (currencyResolved || chosen) return;
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!tz || tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return;
    switchCurrency("USD");
    // Mount-only fallback; re-running it would fight the toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = useMemo(() => {
    const n = (v: string) => {
      const x = Number(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(x) && x > 0 ? x : 0;
    };
    const pct = (v: string) => Math.min(n(v), 100) / 100;
    const s = n(spend);
    const l = n(leads);
    const qualified = l * pct(pickup) * pct(fit) * pct(show);
    const cpl = l > 0 ? s / l : 0;
    const cpq = qualified > 0 ? s / qualified : 0;
    const wasted = l > 0 ? s * (1 - qualified / l) : 0;
    const multiple = cpl > 0 && cpq > 0 ? cpq / cpl : 0;
    return { qualified, cpl, cpq, wasted, multiple };
  }, [spend, leads, pickup, fit, show]);

  const locale = currency === "INR" ? "en-IN" : "en-US";
  const money = (v: number) => `${SYMBOL[currency]}${Math.round(v).toLocaleString(locale)}`;
  const L = QUALIFIED_COST.labels;
  const R = QUALIFIED_COST.results;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="text-sm text-[var(--muted-foreground)]">Currency</span>
          {(["INR", "USD"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setChosen(true);
                switchCurrency(c);
              }}
              className={`rounded-md border px-3 py-1 text-sm ${c === currency ? "bg-green-600 font-medium text-white" : ""}`}
            >
              {SYMBOL[c]} {c}
            </button>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="qc-spend" label={`${L.spend} (${currency})`} value={spend} onChange={setSpend} />
          <Field id="qc-leads" label={L.leads} value={leads} onChange={setLeads} />
          <Field id="qc-pickup" label={L.pickup} value={pickup} onChange={setPickup} />
          <Field id="qc-fit" label={L.fit} value={fit} onChange={setFit} />
          <Field id="qc-show" label={L.show} value={show} onChange={setShow} />
        </div>
      </div>

      <div className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={R.cpl} value={money(r.cpl)} />
          <Stat label={R.qualified} value={r.qualified.toFixed(r.qualified < 10 ? 1 : 0)} />
          <Stat label={R.cpq} value={r.cpq > 0 ? money(r.cpq) : "-"} />
          <Stat label={R.wasted} value={money(r.wasted)} />
        </div>
        {r.cpq > 0 ? (
          <p className="mt-6 text-2xl font-bold sm:text-3xl">
            {QUALIFIED_COST.bigLine(money(r.cpq), r.multiple.toFixed(r.multiple < 10 ? 1 : 0))}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">{QUALIFIED_COST.note}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight">{QUALIFIED_COST.gateHeading}</h3>
          <ul className="mt-2 flex flex-col gap-1.5 leading-relaxed text-[var(--muted-foreground)]">
            {QUALIFIED_COST.gatePoints.map((p) => (
              <li key={p.strong}>
                <strong className="text-[var(--foreground)]">{p.strong}</strong> {p.text}
              </li>
            ))}
          </ul>
        </div>
        <CtaLink href={cta.href} className={buttonVariants({ size: "lg" })}>
          {cta.trialLabel}
        </CtaLink>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

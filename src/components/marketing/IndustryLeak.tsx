"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RECLAIM_SHARE,
  WRONG_FIT_BANDS,
  type IndustryLeakSpec,
} from "@/lib/marketing/industries/types";
import {
  INR_PER_USD,
  convertDefault,
  count,
  currencyWord,
  inWords,
  money,
  roundNice,
  type Currency,
} from "@/lib/marketing/currency";

/**
 * The leak calculator. Two sides: what today costs, and what the same budget
 * does once the wrong-fit traffic stops being bought.
 *
 * It measures MONEY. An earlier version costed the staff hours spent
 * disqualifying, which is true and recognised by nobody, because those people
 * are salaried and were going to be at work regardless. The figure that lands
 * is the ad spend buying people who can never buy, and the sales that budget
 * could have bought instead.
 *
 * Three rules it exists to honour:
 *
 *  1. No number appears without its arithmetic. The working is printed under
 *     each side, line by line, in the visitor's own figures.
 *  2. The close rate is THEIRS. It is derived from the two numbers they typed,
 *     outcomes divided by qualified enquiries, so the before side contains no
 *     assumption of ours at all.
 *  3. The one modelled figure, RECLAIM_SHARE, is named in the footnote. It is
 *     deliberately low, because a number an operator can pick apart is worth
 *     less than a smaller one they cannot.
 *
 * It imports its constants from industries/types rather than from the registry,
 * which is what keeps twenty-one industries' page copy out of the client bundle.
 */
export function IndustryLeak({
  spec,
  initialCurrency,
  currencyResolved,
}: {
  spec: IndustryLeakSpec;
  initialCurrency: Currency;
  /** False when no country header reached the server, so the client may guess. */
  currencyResolved: boolean;
}) {
  const defaultBand =
    WRONG_FIT_BANDS.find((b) => b.id === spec.wrongFitDefaultBand) ?? WRONG_FIT_BANDS[1];

  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [currencyChosen, setCurrencyChosen] = useState(false);
  const [enquiries, setEnquiries] = useState(String(spec.enquiriesDefault));
  const [outcomes, setOutcomes] = useState(String(spec.outcomesDefault));
  const [value, setValue] = useState(String(convertDefault(spec.valueDefault, initialCurrency)));
  const [spend, setSpend] = useState(String(convertDefault(spec.spendDefault, initialCurrency)));
  const [bandId, setBandId] = useState<string>(defaultBand.id);
  const [wrongFitPct, setWrongFitPct] = useState(String(defaultBand.pct));

  /**
   * Move the two money fields to another currency, converting what is in them.
   *
   * Converting the typed values rather than re-seeding the defaults is the only
   * behaviour that does not throw away work: somebody who has entered their real
   * ad spend and then switches currency means the same amount of money, not the
   * example one. A round trip drifts slightly, because each leg rounds to two
   * significant figures, and that is the right trade for a prefill nobody is
   * reconciling against a bank statement.
   */
  function switchCurrency(next: Currency) {
    setCurrencyChosen(true);
    if (next === currency) return;
    const convert = (raw: string) => {
      const n = Number(raw.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) return raw;
      return String(roundNice(next === "USD" ? n / INR_PER_USD : n * INR_PER_USD));
    };
    setValue(convert(value));
    setSpend(convert(spend));
    setCurrency(next);
  }

  /**
   * The second guess at the visitor's currency, made in the browser.
   *
   * The server's only country signal is Cloudflare's cf-ipcountry, which is
   * absent on any request that did not come through Cloudflare. Rather than show
   * a reader in Toronto a page denominated in rupees, fall back to the one
   * region signal the browser always has: its own timezone. India stays on
   * rupees, an unknown timezone stays on rupees, and everything else moves to
   * dollars.
   *
   * Runs once, only when the server did not resolve a country, and never over
   * the top of a choice the visitor has already made with the toggle.
   */
  useEffect(() => {
    if (currencyResolved || currencyChosen) return;
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!tz) return;
    if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return;
    switchCurrency("USD");
    // Deliberately mount-only: this is a one-shot fallback, and re-running it
    // when the visitor edits a field would fight the toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickBand(id: string, pct: number) {
    setBandId(id);
    setWrongFitPct(String(pct));
  }

  const r = useMemo(() => {
    const n = (v: string) => {
      const x = Number(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(x) && x > 0 ? x : 0;
    };
    const total = n(enquiries);
    const pct = Math.min(n(wrongFitPct), 100);
    const perSale = n(value);
    const adSpend = n(spend);

    const wrongFit = Math.round((total * pct) / 100);
    const qualified = Math.max(total - wrongFit, 0);

    // Their close rate, from their own two numbers. Capped at 1: somebody who
    // types more sales than qualified enquiries has misread a label, and a
    // close rate above 100% would quietly inflate every figure below it.
    const sales = Math.min(n(outcomes), qualified > 0 ? qualified : n(outcomes));
    const closeRate = qualified > 0 ? Math.min(sales / qualified, 1) : 0;

    // What a qualified enquiry actually costs today: the WHOLE budget divided by
    // the qualified enquiries it produced. Not the blended cost per enquiry,
    // which is cheap precisely because most of what it buys is worthless.
    const costPerQualified = qualified > 0 ? adSpend / qualified : 0;
    const costPerSale = sales > 0 ? adSpend / sales : 0;

    const wastedSpend = (adSpend * pct) / 100;
    const reclaimed = wastedSpend * RECLAIM_SHARE;
    const extraQualified = costPerQualified > 0 ? reclaimed / costPerQualified : 0;
    const extraSales = extraQualified * closeRate;
    const extraRevenue = extraSales * perSale;
    const salesAfter = sales + extraSales;
    const costPerSaleAfter = salesAfter > 0 ? adSpend / salesAfter : 0;

    return {
      count: total,
      pct,
      perSale,
      adSpend,
      wrongFit,
      qualified,
      sales,
      closeRate,
      costPerQualified,
      costPerSale,
      wastedSpend,
      reclaimed,
      extraQualified,
      extraSales,
      extraRevenue,
      salesAfter,
      costPerSaleAfter,
      revenueToday: sales * perSale,
    };
  }, [enquiries, outcomes, value, spend, wrongFitPct]);

  const nothingToCatch = r.wrongFit === 0;
  const amount = (v: number) => money(v, currency);
  const whole = (v: number) => count(v, currency);
  const inCurrency = `, in ${currencyWord(currency)}`;

  return (
    <div className="flex flex-col gap-8">
      {/* ---- Inputs --------------------------------------------------- */}
      <div className="rounded-xl border p-5 sm:p-6">
        {/* The currency, and a way to correct it.

            Opened by the server from the visitor's country, or by the browser's
            timezone when no country header arrived. Both are guesses, so the
            toggle is not a preference panel, it is the page admitting it might
            be wrong about where the reader is. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <p className="text-sm text-[var(--muted-foreground)]">
            Figures shown in {currencyWord(currency)}
          </p>
          <div className="flex gap-2" role="group" aria-label="Currency">
            {(["INR", "USD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={currency === c}
                onClick={() => switchCurrency(c)}
                className={
                  currency === c
                    ? "rounded-md border-2 border-green-600 bg-green-600/10 px-3 py-1.5 text-sm font-medium"
                    : "rounded-md border px-3 py-1.5 text-sm transition-colors hover:border-green-600"
                }
              >
                {c === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="leak-enquiries" label={spec.enquiriesLabel}>
            <Input
              id="leak-enquiries"
              inputMode="numeric"
              value={enquiries}
              onChange={(e) => setEnquiries(e.target.value)}
            />
          </Field>
          <Field id="leak-outcomes" label={spec.outcomesLabel}>
            <Input
              id="leak-outcomes"
              inputMode="numeric"
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
            />
          </Field>
          <Field id="leak-value" label={`${spec.valueLabel}${inCurrency}`} hint={spec.valueHint}>
            <Input
              id="leak-value"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Field id="leak-spend" label={`${spec.spendLabel}${inCurrency}`} hint={spec.spendHint}>
            <Input
              id="leak-spend"
              inputMode="numeric"
              value={spend}
              onChange={(e) => setSpend(e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="mt-6 border-t pt-6">
          <legend className="sr-only">{spec.wrongFitLegend}</legend>
          <p className="font-medium">{spec.wrongFitLegend}</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{spec.wrongFitHint}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WRONG_FIT_BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={bandId === b.id}
                onClick={() => pickBand(b.id, b.pct)}
                className={
                  bandId === b.id
                    ? "rounded-md border-2 border-green-600 bg-green-600/10 px-3 py-2.5 text-sm font-medium"
                    : "rounded-md border px-3 py-2.5 text-sm transition-colors hover:border-green-600"
                }
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="leak-pct">{spec.wrongFitLabel}</Label>
            <Input
              id="leak-pct"
              inputMode="numeric"
              value={wrongFitPct}
              onChange={(e) => {
                setBandId("");
                setWrongFitPct(e.target.value);
              }}
              className="max-w-28"
            />
          </div>
        </fieldset>
      </div>

      {/* ---- Before ---------------------------------------------------- */}
      <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="loss">Loss</Chip>
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            {spec.beforeHeading}
          </p>
        </div>

        <p className="mt-5 text-sm text-[var(--muted-foreground)]">
          Ad spend buying {plural(spec.unit)} that can never become a {spec.outcomeUnit}
        </p>
        <p className="mt-2 text-3xl font-bold text-amber-600 sm:text-4xl dark:text-amber-400">
          {amount(r.wastedSpend)}{" "}
          <span className="text-base font-medium text-[var(--muted-foreground)]">
            a month, lost
          </span>
        </p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {amount(r.wastedSpend * 12)} a year
          {inWords(r.wastedSpend * 12, currency)
            ? `. ${inWords(r.wastedSpend * 12, currency)}`
            : ""}
        </p>

        {/* Two tiles, both losses. An earlier version put today's revenue here
            as a third, marked neither loss nor gain, which is not a thing a
            figure in this row can be: a reader scanning three amounts in
            identical type reads all three as the damage. The baseline belongs
            in the working below, where it is context rather than a headline. */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Stat
            label={`Wrong-fit ${plural(spec.unit)} a month`}
            value={`${whole(r.wrongFit)} of ${whole(r.count)}`}
            tone="loss"
            sub="Paid for, and they reach your team anyway"
          />
          <Stat
            label={`What each ${spec.outcomeUnit} costs you today`}
            value={amount(r.costPerSale)}
            tone="loss"
            sub="Inflated by everyone who could never buy"
          />
        </div>

        <Working>
          <Line>
            {whole(r.count)} {plural(spec.unit)} × {whole(r.pct)}% that can never buy ={" "}
            <Em>
              {whole(r.wrongFit)} wrong-fit, {whole(r.qualified)} qualified
            </Em>
          </Line>
          <Line>
            {amount(r.adSpend)} ad spend × {whole(r.pct)}% ={" "}
            <Em>{amount(r.wastedSpend)} lost a month</Em>
          </Line>
          <Detail>
            <Line>
              {amount(r.adSpend)} ÷ {whole(r.sales)} {pluralOutcome(spec, r.sales)} ={" "}
              <Em>{amount(r.costPerSale)}</Em> per {spec.outcomeUnit} today
            </Line>
            <Line>
              {whole(r.sales)} ÷ {whole(r.qualified)} qualified = <Em>{pct(r.closeRate)}</Em> close
              rate on a qualified {spec.unit}, which is your number, not ours
            </Line>
            <Line>
              {whole(r.sales)} {pluralOutcome(spec, r.sales)} × {amount(r.perSale)} ={" "}
              <Em>{amount(r.revenueToday)}</Em> a month, the baseline everything above is
              measured against
            </Line>
          </Detail>
        </Working>
      </div>

      {/* ---- After ----------------------------------------------------- */}
      <div className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="gain">Gain</Chip>
          <p className="text-sm font-semibold uppercase tracking-wide text-green-600">
            {spec.afterHeading}
          </p>
        </div>

        {nothingToCatch ? (
          <p className="mt-5 leading-relaxed">
            At nought in a hundred there is nothing for a gate to catch, and the arithmetic says
            so: no wasted spend, no reclaimed budget, nothing to gain. If that is genuinely your
            funnel, you do not need this product.
          </p>
        ) : (
          <>
            <p className="mt-5 text-sm text-[var(--muted-foreground)]">
              Extra revenue from the same ad budget
            </p>
            <p className="mt-2 text-3xl font-bold text-green-600 sm:text-4xl">
              {amount(r.extraRevenue)}{" "}
              <span className="text-base font-medium text-[var(--muted-foreground)]">
                a month, gained
              </span>
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {amount(r.extraRevenue * 12)} a year
              {inWords(r.extraRevenue * 12, currency)
                ? `. ${inWords(r.extraRevenue * 12, currency)}`
                : ""}
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <Stat
                label={`Wrong-fit ${plural(spec.unit)} reaching your team`}
                value="0"
                tone="gain"
                sub={`${whole(r.wrongFit)} a month never become a lead`}
              />
              <Stat
                label={`Extra ${spec.outcomeUnitPlural} a month`}
                value={r.extraSales.toFixed(1)}
                tone="gain"
                sub="From the same budget, nothing added"
              />
              <Stat
                label={`What each ${spec.outcomeUnit} costs you`}
                value={amount(r.costPerSaleAfter)}
                tone="gain"
                sub={`Down from ${amount(r.costPerSale)}`}
              />
            </div>

            <Working tone="green">
              <Line>
                {amount(r.wastedSpend)} lost × {Math.round(RECLAIM_SHARE * 100)}% reclaimed ={" "}
                <Em>{amount(r.reclaimed)}</Em> a month redirected
              </Line>
              <Line>
                {r.extraSales.toFixed(1)} more {spec.outcomeUnitPlural} × {amount(r.perSale)} ={" "}
                <Em>{amount(r.extraRevenue)} gained a month</Em>
              </Line>
              <Detail>
                <Line>
                  {amount(r.adSpend)} ÷ {whole(r.qualified)} qualified ={" "}
                  <Em>{amount(r.costPerQualified)}</Em>, what a qualified {spec.unit} costs you
                  today
                </Line>
                <Line>
                  {amount(r.reclaimed)} ÷ {amount(r.costPerQualified)} ={" "}
                  <Em>
                    {r.extraQualified.toFixed(1)} more qualified {plural(spec.unit)}
                  </Em>{" "}
                  a month, × {pct(r.closeRate)} close rate ={" "}
                  <Em>
                    {r.extraSales.toFixed(1)} more {spec.outcomeUnitPlural}
                  </Em>
                </Line>
                <Line>{spec.reclaimNote}</Line>
                {currency === "USD" ? (
                  <Line>
                    The figures this page prefilled were written in rupees and converted at{" "}
                    {INR_PER_USD} to the dollar, rounded. Everything above is derived from what you
                    typed, so the rate moves the starting point and never the answer.
                  </Line>
                ) : null}
              </Detail>
            </Working>
          </>
        )}
      </div>

      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">{spec.assumptions}</p>
    </div>
  );
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function plural(unit: string): string {
  return unit.endsWith("y") ? `${unit.slice(0, -1)}ies` : `${unit}s`;
}

function pluralOutcome(spec: IndustryLeakSpec, n: number): string {
  return n === 1 ? spec.outcomeUnit : spec.outcomeUnitPlural;
}

function Working({ children, tone }: { children: React.ReactNode; tone?: "green" }) {
  return (
    <div
      className={`mt-7 flex flex-col gap-1.5 border-t pt-5 text-sm text-[var(--muted-foreground)] sm:text-[0.95rem] ${
        tone === "green" ? "border-green-600/20" : "border-amber-500/25"
      }`}
    >
      {children}
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

/**
 * The derivation steps, folded away.
 *
 * These lines are how the model gets from one visible figure to the next: the
 * unit price of a qualified enquiry, the division back out into a count. They
 * are methodology, and on the face of the page they read as notes to ourselves
 * rather than as anything a business owner came here for.
 *
 * Folded, not deleted. The page's own rule is that no number appears without
 * its arithmetic, so hiding the working would be worse than showing too much
 * of it. A reader who wants to audit the chain opens one summary and gets every
 * step; everybody else reads two lines and moves on.
 */
function Detail({ children }: { children: React.ReactNode }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer list-none text-sm font-medium underline underline-offset-4 decoration-dotted">
        <span className="group-open:hidden">Check the arithmetic</span>
        <span className="hidden group-open:inline">Hide the arithmetic</span>
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </details>
  );
}

/** Says in a word whether the figures below it are money going out or coming in. */
function Chip({ children, tone }: { children: React.ReactNode; tone: "loss" | "gain" }) {
  return (
    <span
      className={
        tone === "loss"
          ? "rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400"
          : "rounded-full bg-green-600/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-400"
      }
    >
      {children}
    </span>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[var(--foreground)]">{children}</strong>;
}

/**
 * A figure, and what KIND of figure it is.
 *
 * The tone word is not decoration. Amounts sitting in a row in identical type
 * are genuinely ambiguous, and a cost that falls reads as a cost unless
 * something says otherwise.
 *
 * Loss or gain, and nothing else. There was briefly a third tone for figures
 * that were neither, which is not a state a number in this row can be in: if it
 * is neither money lost nor money gained it is context, and context belongs in
 * the working rather than in a headline tile.
 */
function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "loss" | "gain";
}) {
  const toneLabel = tone === "loss" ? "Loss" : "Gain";
  const toneClass =
    tone === "loss" ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400";

  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-wide ${toneClass}`}>{toneLabel}</p>
      <p className="mt-1 text-2xl font-bold sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{sub}</p> : null}
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

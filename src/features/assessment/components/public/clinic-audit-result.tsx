"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeResult,
  type ClinicInputs,
  type EngineConfig,
  type ClinicAuditResult,
} from "@/lib/scoring/clinic-audit";
import { formatINR, monthlyLabel, pctLabel } from "@/lib/format/inr";

/**
 * Divine Leads clinic-audit result — the interactive, forwardable page. The reader
 * can check the arithmetic himself by editing the three inputs; everything derived
 * recomputes via the SAME pure engine (never a second copy). The BAND is fixed from
 * the original submission (editing can't change it). Self-contained brand styling.
 */

const BRAND_CSS = `
.dl { --ink:#0E3540; --teal:#134E5A; --gold:#C9A34E; --gold-d:#B8913F; --paper:#F7F5F0;
  --line:#DCD6C9; --muted:#5C6E73;
  --serif:"Spectral",Georgia,"Times New Roman",serif;
  --body:"Inter Tight","Segoe UI",system-ui,-apple-system,sans-serif;
  --mono:"IBM Plex Mono","SF Mono",ui-monospace,"Cascadia Mono",Menlo,monospace;
  background:var(--paper); color:var(--ink); font-family:var(--body);
  max-width:720px; margin:0 auto; padding:24px 16px 64px; line-height:1.5; }
.dl * { box-sizing:border-box; }
.dl h1,.dl h2,.dl h3 { font-family:var(--serif); font-weight:600; margin:0; }
.dl .eyebrow { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.dl .num { font-family:var(--mono); font-variant-numeric:tabular-nums; }
.dl .figures { display:grid; grid-template-columns:1fr; gap:12px; margin:16px 0; }
.dl .fig { border:1px solid var(--line); border-radius:4px; padding:16px; background:#fff; }
.dl .fig .cap { font-size:12px; letter-spacing:.06em; text-transform:uppercase; }
.dl .fig .amt { font-family:var(--mono); font-weight:600; margin-top:4px; }
.dl .fig .sub { font-size:13px; color:var(--muted); margin-top:2px; }
.dl .fig.today .cap { color:var(--teal); }
.dl .fig.gap { border-color:var(--gold); }
.dl .fig.gap .cap { color:var(--gold-d); }
.dl .fig.gap .amt { font-size:34px; color:var(--gold-d); }
.dl .fig.today .amt,.dl .fig.full .amt { font-size:22px; }
.dl .fig.full { background:transparent; }
.dl .fig.full .cap { color:var(--muted); }
.dl .inputs { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin:8px 0 16px; }
@media (max-width:560px){ .dl .inputs{ grid-template-columns:1fr; } }
.dl .field label { display:block; font-size:12px; color:var(--muted); margin-bottom:4px; }
.dl .field input { width:100%; font-family:var(--mono); font-size:16px; padding:8px 6px;
  border:0; border-bottom:2px solid var(--gold); background:transparent; color:var(--ink); }
.dl .field input:focus { outline:2px solid var(--gold); outline-offset:2px; }
.dl .field .hint { font-size:11px; color:var(--muted); margin-top:3px; }
.dl .field.invalid input { border-bottom-color:#b04a3a; }
.dl .note { font-size:13px; color:var(--muted); background:#fff; border:1px solid var(--line);
  border-radius:4px; padding:12px; }
.dl .calc { background:#fff; border:1px solid var(--line); border-radius:4px; padding:12px 14px; margin-top:14px; }
.dl .calc-title { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--teal); margin-bottom:6px; }
.dl .calc-title.pot { color:var(--gold-d); }
.dl .calc-row { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:baseline;
  column-gap:10px; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px; }
.dl .calc-row:last-child { border-bottom:0; }
.dl .calc-row.op span:first-child { color:var(--muted); }
.dl .calc-row.final { font-weight:600; }
.dl .calc-row.revenue { color:var(--teal); font-weight:700; font-size:15px; padding-top:8px; }
.dl .calc-row.revenue.pot { color:var(--gold-d); }
.dl .assumed-tag { font-size:10px; color:var(--gold-d); font-style:italic; margin-left:6px; font-weight:400; }
.dl .prose { white-space:pre-line; }
.dl .prose h3 { margin-top:18px; margin-bottom:4px; font-size:16px; }
.dl .block { border-top:1px solid var(--line); padding-top:16px; margin-top:20px; }
.dl .block h2 { font-size:18px; margin-bottom:6px; }
.dl .btn { display:inline-block; background:var(--gold-d); color:#fff; font-family:var(--body);
  font-weight:600; text-decoration:none; padding:12px 20px; border-radius:4px; border:0; cursor:pointer;
  font-size:15px; }
.dl .btn.wa { background:var(--teal); }
.dl .link { color:var(--teal); text-decoration:underline; cursor:pointer; background:none; border:0;
  font-family:var(--body); font-size:14px; padding:0; }
.dl .cal { width:100%; height:640px; border:1px solid var(--line); border-radius:4px; margin-top:12px; }
.dl .cap-lead { background:#fff; border:1px solid var(--gold); border-radius:4px; padding:14px; margin:12px 0; }
`;

interface Props {
  inputs: ClinicInputs;
  config: EngineConfig;
  original: ClinicAuditResult;
  prose: string | null;
  bookingUrl: string | null;
  resultUrl: string;
  title: string;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener?.("change", h);
    return () => m.removeEventListener?.("change", h);
  }, []);
  return reduced;
}

/** Count up to `target` once on mount (unless reduced-motion). */
function useCountUp(target: number, reduced: boolean): number {
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setV(target); return; }
    const dur = 900;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Only on mount — recomputes update via the live result, not this animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** One decimal place, trimmed ("2.4", "2" not "2.0"). */
function fmt1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
/** A funnel-stage count: one decimal under 20 (so small counts stay honest — never
 *  rounds a real 2.4 down to a misleading "2"), whole numbers above. */
function fmtStep(n: number): string {
  if (n <= 0) return "0";
  return n < 20 ? fmt1(n) : String(Math.round(n));
}
/** The final "cases" step needs special handling: a sub-1 monthly rate must never
 *  render as a bare "0" (which would make "0 cases × price = revenue" look broken
 *  to a reader) — show the honest fraction plus a plain-English frequency. */
function caseLine(n: number): { text: string; hint: string | null } {
  if (n <= 0) return { text: "0", hint: null };
  if (n < 1) {
    const months = Math.max(1, Math.round(1 / n));
    return { text: fmt1(n), hint: months <= 1 ? "roughly 1 case a month" : `roughly 1 case every ${months} months` };
  }
  return { text: fmtStep(n), hint: null };
}
/** Enquiries → booked → attended → cases, at a given rate chain. Cases uses the
 *  UNROUNDED chain (matches the engine's own casesNowExact/casesPotentialExact),
 *  so the displayed revenue always reconciles with the displayed case count. */
function buildTrail(E: number, B: number, S: number, C: number) {
  const booked = E * B;
  const attended = booked * S;
  const cases = attended * C;
  return { booked, attended, cases };
}

export function ClinicAuditResult({ inputs, config, original, prose, bookingUrl, resultUrl, title }: Props) {
  const reduced = useReducedMotion();

  // Editable inputs (strings while typing). C is 0..10 = closeRate × 10.
  const [eStr, setEStr] = useState(String(inputs.E));
  const [vStr, setVStr] = useState(String(inputs.V));
  const [cStr, setCStr] = useState(String(Math.round(inputs.C * 10)));
  // Committed, clamped numeric values that actually drive the math.
  const [E, setE] = useState(inputs.E);
  const [V, setV] = useState(inputs.V);
  const [C10, setC10] = useState(Math.round(inputs.C * 10));

  // Debounced commit: parse → clamp → commit, holding previous on invalid input.
  useEffect(() => {
    const id = setTimeout(() => {
      const e = parseInt(eStr, 10);
      if (Number.isFinite(e) && e > 0) setE(clampNum(e, 1, 2000));
      const v = parseInt(vStr, 10);
      if (Number.isFinite(v) && v > 0) setV(clampNum(v, 1000, 1_000_000));
      const c = parseInt(cStr, 10);
      if (Number.isFinite(c)) setC10(clampNum(c, 0, 10));
    }, 400);
    return () => clearTimeout(id);
  }, [eStr, vStr, cStr]);

  const eInvalid = !(parseInt(eStr, 10) > 0);
  const vInvalid = !(parseInt(vStr, 10) > 0);
  const cInvalid = !Number.isFinite(parseInt(cStr, 10));

  const result = useMemo(
    () => computeResult({ ...inputs, E, V, C: C10 / 10 }, config),
    [inputs, config, E, V, C10],
  );
  const edited = E !== inputs.E || V !== inputs.V || C10 !== Math.round(inputs.C * 10);
  const eEdited = E !== inputs.E;
  const vEdited = V !== inputs.V;
  const cEdited = C10 !== Math.round(inputs.C * 10);
  // An "assumed" tag only applies to the ORIGINAL submission's fallback figures
  // (role labels must match ROLE_LABEL in lib/scoring/clinic-audit.ts exactly) —
  // once the reader edits that specific field, it's their own number, not ours.
  const isAssumed = (label: string, fieldEdited: boolean) => !fieldEdited && original.assumptions.includes(label);
  const todayTrail = buildTrail(result.enquiries, result.bookRateNow, result.showUpNow, result.closeRate);
  const potTrail = buildTrail(result.enquiries, result.bookRateImproved, result.showUpImproved, result.closeRate);
  const caseToday = caseLine(todayTrail.cases);
  const casePot = caseLine(potTrail.cases);

  const goldCount = useCountUp(original.gap, reduced);
  const showGap = edited ? result.gap : goldCount;

  const commit = () => {
    const e = parseInt(eStr, 10); if (Number.isFinite(e) && e > 0) { const c = clampNum(e, 1, 2000); setE(c); setEStr(String(c)); }
    const v = parseInt(vStr, 10); if (Number.isFinite(v) && v > 0) { const c = clampNum(v, 1000, 1_000_000); setV(c); setVStr(String(c)); }
    const cc = parseInt(cStr, 10); if (Number.isFinite(cc)) { const c = clampNum(cc, 0, 10); setC10(c); setCStr(String(c)); }
  };
  const reset = () => {
    setEStr(String(inputs.E)); setE(inputs.E);
    setVStr(String(inputs.V)); setV(inputs.V);
    setCStr(String(Math.round(inputs.C * 10))); setC10(Math.round(inputs.C * 10));
  };

  const waHref = `https://wa.me/?text=${encodeURIComponent(`${title} — see the numbers here: ${resultUrl}`)}`;

  return (
    <div className="dl">
      <style dangerouslySetInnerHTML={{ __html: BRAND_CSS }} />
      <p className="eyebrow">{title}</p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>What your current funnel is worth</h1>

      {/* Three figures */}
      <div className="figures" aria-live="polite">
        <div className="fig today">
          <div className="cap">Earning today</div>
          <div className="amt">{formatINR(result.revenueNow)}</div>
          <div className="sub">{result.casesNow} cases from {result.enquiries} enquiries · {monthlyLabel(result.revenueNow)}</div>
          <div className="sub num">{formatINR(result.revenueNow * 12)} a year</div>
        </div>
        <div className="fig gap">
          <div className="cap">Lost in the gap</div>
          <div className="amt">{formatINR(showGap)}</div>
          <div className="sub">{Math.max(0, result.casesPotential - result.casesNow)} cases never reached · {monthlyLabel(result.gap)}</div>
          <div className="sub num">{formatINR(result.annualGap)} a year</div>
        </div>
        <div className="fig full">
          <div className="cap">Full potential</div>
          <div className="amt">{formatINR(result.revenuePotential)}</div>
          <div className="sub">{result.casesPotential} cases at the same close rate</div>
        </div>
      </div>

      {/* Editable inputs */}
      <div className="inputs">
        <div className={`field${eInvalid ? " invalid" : ""}`}>
          <label htmlFor="dl-e">New patient enquiries a month</label>
          <input id="dl-e" inputMode="numeric" pattern="[0-9]*" value={eStr}
            onChange={(e) => setEStr(e.target.value)} onBlur={commit} />
          <div className="hint">Change it if you know your real number.</div>
        </div>
        <div className={`field${vInvalid ? " invalid" : ""}`}>
          <label htmlFor="dl-v">Average value of one completed treatment</label>
          <input id="dl-v" inputMode="numeric" pattern="[0-9]*" value={vStr}
            onChange={(e) => setVStr(e.target.value)} onBlur={commit} />
          <div className="hint">Change it if you know your real number.</div>
        </div>
        <div className={`field${cInvalid ? " invalid" : ""}`}>
          <label htmlFor="dl-c">Of every 10 who attend, how many go ahead?</label>
          <input id="dl-c" inputMode="numeric" pattern="[0-9]*" value={cStr}
            onChange={(e) => setCStr(e.target.value)} onBlur={commit} />
          <div className="hint">Change it if you know your real number.</div>
        </div>
      </div>
      {edited ? <button className="link" onClick={reset}>Reset to my answers</button> : null}

      {/* The full calculation, every stage, in the open — the reader can check it
          against their own rough numbers. Never hidden behind a toggle. */}
      <div className="calc" aria-live="polite">
        <p className="calc-title">Today — how we got this number</p>
        <div className="calc-row">
          <span>Monthly enquiries</span>
          <span className="num">
            {fmtStep(result.enquiries)}
            {isAssumed("monthly enquiries", eEdited) ? <span className="assumed-tag">assumed</span> : null}
          </span>
        </div>
        <div className="calc-row op">
          <span>× Booking rate ({pctLabel(result.bookRateNow)})</span>
          <span className="num">= {fmtStep(todayTrail.booked)} booked</span>
        </div>
        <div className="calc-row op">
          <span>× Show-up rate ({pctLabel(result.showUpNow)})</span>
          <span className="num">= {fmtStep(todayTrail.attended)} attended</span>
        </div>
        <div className="calc-row op final">
          <span>
            × Close rate ({pctLabel(result.closeRate)})
            {isAssumed("close rate", cEdited) ? <span className="assumed-tag">assumed</span> : null}
          </span>
          <span className="num">
            = {caseToday.text} patient{caseToday.text === "1" ? "" : "s"}/month
            {caseToday.hint ? ` (${caseToday.hint})` : ""}
          </span>
        </div>
        <div className="calc-row op revenue">
          <span>
            × Treatment value ({formatINR(result.treatmentValue)})
            {isAssumed("treatment value", vEdited) ? <span className="assumed-tag">assumed</span> : null}
          </span>
          <span className="num">= {formatINR(result.revenueNow)}/month</span>
        </div>
      </div>

      <div className="calc" style={{ marginTop: 12 }}>
        <p className="calc-title pot">Achievable — fixing response speed &amp; follow-up</p>
        <div className="calc-row">
          <span>Monthly enquiries (same)</span>
          <span className="num">{fmtStep(result.enquiries)}</span>
        </div>
        <div className="calc-row op">
          <span>× Booking rate ({pctLabel(result.bookRateImproved)})</span>
          <span className="num">= {fmtStep(potTrail.booked)} booked</span>
        </div>
        <div className="calc-row op">
          <span>× Show-up rate ({pctLabel(result.showUpImproved)})</span>
          <span className="num">= {fmtStep(potTrail.attended)} attended</span>
        </div>
        <div className="calc-row op final">
          <span>× Close rate ({pctLabel(result.closeRate)}, unchanged — this is yours, never modelled as improving)</span>
          <span className="num">
            = {casePot.text} patient{casePot.text === "1" ? "" : "s"}/month
            {casePot.hint ? ` (${casePot.hint})` : ""}
          </span>
        </div>
        <div className="calc-row op revenue pot">
          <span>× Treatment value ({formatINR(result.treatmentValue)})</span>
          <span className="num">= {formatINR(result.revenuePotential)}/month</span>
        </div>
      </div>

      {result.closeRate === 0 ? (
        <p className="note" style={{ marginTop: 12 }}>
          At a 0% close rate no consultations are converting — that is a consultation-room
          question, not an acquisition one. Adding enquiries won&apos;t change it.
        </p>
      ) : null}

      {/* Assumptions */}
      {result.assumptions.length > 0 ? (
        <p className="note" style={{ marginTop: 12 }}>
          Figures marked <em>assumed</em> above were used because you weren&apos;t sure of the real
          number. Enquiries, treatment value, and close rate are editable higher up the page —
          change them and every number here recalculates.
        </p>
      ) : null}

      {/* Capacity-blocked lead */}
      {original.capacityBlocked ? (
        <div className="cap-lead">
          <strong>Acquisition is not your constraint right now.</strong> You reported little spare
          capacity, so more enquiries would create pressure rather than revenue. Fix throughput
          first — the numbers below still show what the demand is worth.
        </div>
      ) : null}

      {/* AI prose */}
      {prose ? (
        <div className="block">
          {edited ? <p className="hint" style={{ color: "var(--muted)", marginBottom: 6 }}>Written from your original answers.</p> : null}
          <div className="prose" dangerouslySetInnerHTML={{ __html: proseToHtml(prose) }} />
        </div>
      ) : null}

      {/* Five-case block */}
      <div className="block">
        <h2>What five more cases a month would take</h2>
        <p>
          At your own close rate, held constant: <span className="num">{result.fiveCases.attended}</span> consultations
          attended, <span className="num">{result.fiveCases.booked}</span> booked, <span className="num">{result.fiveCases.enquiries}</span> enquiries,
          roughly <span className="num">{formatINR(result.fiveCases.adSpend)}</span> in ad spend. The close rate here is your
          own reported figure — never modelled as improving.
        </p>
      </div>

      {/* Dormant database */}
      {result.dormant.recoverable > 0 ? (
        <div className="block">
          <h2>Already sitting in your clinic</h2>
          <p>
            About <span className="num">{result.dormant.recoverable}</span> cases (<span className="num">{formatINR(result.dormant.value)}</span>) are
            recoverable from the dormant enquiries you already hold — no ad spend required. This is
            the first-fortnight number, deliberately conservative.
          </p>
        </div>
      ) : null}

      {/* Talk it through — universal. The calculation above already makes the case;
          it is never gated behind an internal severity band. */}
      <div className="block">
        <h2>Talk it through</h2>
        <p>Book a 1-on-1 video call with our expert to walk through these numbers for your clinic.</p>
        {bookingUrl ? (
          <>
            <iframe className="cal" src={bookingUrl} title="Book a call" loading="lazy" />
            <p style={{ marginTop: 8 }}>
              <a className="btn" href={bookingUrl} target="_blank" rel="noreferrer">Book a 1-on-1 call</a>
            </p>
          </>
        ) : null}
      </div>

      {/* Share */}
      <div className="block">
        <a className="btn wa" href={waHref} target="_blank" rel="noreferrer">Send this to the clinic owner</a>
      </div>
    </div>
  );
}

/** Turn the model's `### Heading` + paragraphs into minimal safe HTML (headings + text). */
function proseToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const b = block.trim();
      const h = b.match(/^#{2,3}\s+(.*)$/);
      if (h) return `<h3>${esc(h[1] ?? "")}</h3>`;
      return `<p>${esc(b)}</p>`;
    })
    .join("");
}

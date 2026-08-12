"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
.dl .arith { font-family:var(--mono); font-size:12.5px; background:#fff; border:1px solid var(--line);
  border-radius:4px; padding:12px; overflow-x:auto; white-space:nowrap; }
.dl .arith div+div { margin-top:6px; }
.dl .note { font-size:13px; color:var(--muted); background:#fff; border:1px solid var(--line);
  border-radius:4px; padding:12px; }
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

  const goldCount = useCountUp(original.gap, reduced);
  const showGap = edited ? result.gap : goldCount;

  const band = original.band; // FIXED from the submission — edits never re-band.
  const critical = band === "CRITICAL" || band === "HIGH";

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

      {/* The arithmetic, visible */}
      <div className="arith" style={{ marginTop: 12 }}>
        <div>
          {result.enquiries} enquiries × {pctLabel(result.bookRateNow)} booking × {pctLabel(result.showUpNow)} show-up × {pctLabel(result.closeRate)} close = {result.casesNow} cases × {formatINR(result.treatmentValue)} = {formatINR(result.revenueNow)}
        </div>
        <div>
          The same {result.enquiries} enquiries at {pctLabel(result.bookRateImproved)} booking and {pctLabel(result.showUpImproved)} show-up = {result.casesPotential} cases = {formatINR(result.revenuePotential)}
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
          We used assumptions for {result.assumptions.join(", ")} because you weren&apos;t sure of
          those figures. They&apos;re editable above, and everything updates.
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

      {/* Conditional close */}
      {critical && !original.notViable ? (
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
      ) : null}

      {band === "MODERATE" && !original.notViable ? (
        <div className="block">
          <h2>One thing to fix first</h2>
          {original.weakestAreas[0]?.clause ? <p>{original.weakestAreas[0].clause}.</p> : null}
          {bookingUrl ? (
            <p><a className="link" href={bookingUrl} target="_blank" rel="noreferrer">Or book a quick call to talk it through →</a></p>
          ) : null}
        </div>
      ) : null}

      {original.notViable || band === "BELOW_THRESHOLD" ? (
        <div className="block">
          <h2>Where this leaves you</h2>
          <p>
            On these numbers the arithmetic does not currently justify a paid engagement. The most
            useful next step is to tighten what you already have — response times, follow-up, and
            recording enquiries — before spending on more of them.
          </p>
        </div>
      ) : null}

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

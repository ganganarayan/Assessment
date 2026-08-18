"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeResult,
  type ClinicInputs,
  type EngineConfig,
  type ClinicAuditResult,
  type ClinicRole,
} from "@/lib/scoring/clinic-audit";
import { fmtStep, caseLine, buildTrail, assumedTagText, roundPatients, roundedRevenue, wholePatientView } from "@/lib/scoring/clinic-trail";
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
.dl .calc-row.rounded { font-weight:600; border-top:1px solid var(--line); }
.dl .ladder { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:12px; }
@media (max-width:560px){ .dl .ladder{ grid-template-columns:1fr; } }
.dl .rung { border:1px solid var(--line); border-radius:4px; padding:12px; background:#fff;
  display:flex; flex-direction:column; }
.dl .rung.mid { border-color:var(--teal); }
.dl .rung.top { border-color:var(--gold); background:#FFFDF7; }
.dl .rung-cap { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
.dl .rung-amt { font-size:20px; font-weight:700; margin-top:6px; }
.dl .rung.mid .rung-amt { color:var(--teal); }
.dl .rung.top .rung-amt { color:var(--gold-d); }
.dl .rung-sub { font-size:12px; color:var(--muted); margin-top:4px; }
.dl .verdict { font-size:16px; font-weight:600; color:var(--gold-d); background:#fff;
  border:1px solid var(--gold); border-radius:4px; padding:12px 14px; margin-top:12px; }
.dl .edit-lead { font-size:14px; background:#fff; border:1px solid var(--gold); border-radius:4px;
  padding:10px 12px; margin-top:14px; }
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
  /** Their own answers, grouped by category — shown back to them so a typo in what
   *  they filled is visible and correctable (every figure here drives the maths). */
  answers?: {
    name: string;
    rows: { text: string; answerLabel: string | null; role?: ClinicRole | null }[];
  }[];
  /** Public assessment URL, so an incoherent result can offer a redo. */
  retakeUrl?: string | null;
}

const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function ClinicAuditResult({ inputs, config, original, prose, bookingUrl, resultUrl, title, answers, retakeUrl }: Props) {
  // Editable inputs (strings while typing). C is 0..10 = closeRate × 10.
  const [eStr, setEStr] = useState(String(inputs.E));
  const [vStr, setVStr] = useState(String(inputs.V));
  const [cStr, setCStr] = useState(String(Math.round(inputs.C * 10)));
  // Committed, clamped numeric values that actually drive the math.
  const [E, setE] = useState(inputs.E);
  const [V, setV] = useState(inputs.V);
  const [C10, setC10] = useState(Math.round(inputs.C * 10));
  // Ad budget drives the performance-marketing projection. Editable so the
  // reader can dial their own number in and watch the whole offer move.
  const [adStr, setAdStr] = useState(String(config.adBudgetMonthly));
  const [adBudget, setAdBudget] = useState(config.adBudgetMonthly);

  // Debounced commit: parse → clamp → commit, holding previous on invalid input.
  useEffect(() => {
    const id = setTimeout(() => {
      const e = parseInt(eStr, 10);
      if (Number.isFinite(e) && e > 0) setE(clampNum(e, 1, 2000));
      const v = parseInt(vStr, 10);
      if (Number.isFinite(v) && v > 0) setV(clampNum(v, 1000, 1_000_000));
      const c = parseInt(cStr, 10);
      if (Number.isFinite(c)) setC10(clampNum(c, 0, 10));
      const ad = parseInt(adStr, 10);
      if (Number.isFinite(ad) && ad > 0) setAdBudget(clampNum(ad, 1000, 10_000_000));
    }, 400);
    return () => clearTimeout(id);
  }, [eStr, vStr, cStr, adStr]);

  const eInvalid = !(parseInt(eStr, 10) > 0);
  const vInvalid = !(parseInt(vStr, 10) > 0);
  const cInvalid = !Number.isFinite(parseInt(cStr, 10));

  const eEdited = E !== inputs.E;
  const vEdited = V !== inputs.V;
  // Close rate is edited via a 0–10 "out of 10" field, which cannot represent every
  // real rate exactly (25% × 10 = 2.5, rounds to 3 = 30%). That rounding must NEVER
  // leak into the actual math unless the reader genuinely typed a new value — so the
  // effective C stays the EXACT original rate (matching the PDF/submission bit-for-
  // bit) until cEdited is true, only then switching to the (now intentional) C10/10.
  const cEdited = C10 !== Math.round(inputs.C * 10);
  const effectiveC = cEdited ? C10 / 10 : inputs.C;

  // The reader's ad budget overrides the configured one, so the projection below
  // responds to what THEY would actually spend.
  const liveConfig = useMemo(() => ({ ...config, adBudgetMonthly: adBudget }), [config, adBudget]);
  const result = useMemo(
    () => computeResult({ ...inputs, E, V, C: effectiveC }, liveConfig),
    [inputs, liveConfig, E, V, effectiveC],
  );
  const edited = eEdited || vEdited || cEdited;
  // An "assumed" tag only applies to the ORIGINAL submission's fallback figures —
  // once the reader edits that specific field, it's their own number, not ours.
  const assumedTag = (role: ClinicRole, label: string, fieldEdited: boolean) =>
    assumedTagText(original.assumptions, original.assumedRangeLabel, role, label, fieldEdited);
  const eTag = assumedTag("ENQUIRIES", "monthly enquiries", eEdited);
  const bTag = assumedTag("BOOK_RATE", "booking rate", false);
  const sTag = assumedTag("SHOWUP_RATE", "show-up rate", false);
  const cTag = assumedTag("CLOSE_RATE", "close rate", cEdited);
  const vTag = assumedTag("TREATMENT_VALUE", "treatment value", vEdited);
  const dTag = assumedTag("DORMANT", "dormant list size", false);
  const todayTrail = buildTrail(result.enquiries, result.bookRateNow, result.showUpNow, result.closeRate);
  const potTrail = buildTrail(result.enquiries, result.bookRateImproved, result.showUpImproved, result.closeRate);
  const caseToday = caseLine(todayTrail.cases);
  const casePot = caseLine(potTrail.cases);
  // The performance-marketing chain, worked FORWARD from the ad budget so every
  // stage reconciles with the money rather than appearing out of nowhere.
  const pmTrail = buildTrail(
    result.performance.enquiries,
    result.bookRateImproved,
    result.showUpImproved,
    result.closeRate,
  );
  // Every SUMMARY figure is restated in whole patients: a reader who sees
  // "1 patient a month" must see one treatment value of money, not the exact
  // 1.4-patient revenue. The exact chain still appears in the trails above each
  // total, so the arithmetic stays checkable.
  const whole = wholePatientView({
    casesNow: todayTrail.cases,
    casesPotential: potTrail.cases,
    casesPm: pmTrail.cases,
    treatmentValue: result.treatmentValue,
    adBudget: result.performance.adBudget,
    serviceFee: result.performance.serviceFee,
  });

  const commit = () => {
    const e = parseInt(eStr, 10); if (Number.isFinite(e) && e > 0) { const c = clampNum(e, 1, 2000); setE(c); setEStr(String(c)); }
    const v = parseInt(vStr, 10); if (Number.isFinite(v) && v > 0) { const c = clampNum(v, 1000, 1_000_000); setV(c); setVStr(String(c)); }
    const cc = parseInt(cStr, 10); if (Number.isFinite(cc)) { const c = clampNum(cc, 0, 10); setC10(c); setCStr(String(c)); }
    const ad = parseInt(adStr, 10); if (Number.isFinite(ad) && ad > 0) { const c = clampNum(ad, 1000, 10_000_000); setAdBudget(c); setAdStr(String(c)); }
  };
  const reset = () => {
    setEStr(String(inputs.E)); setE(inputs.E);
    setVStr(String(inputs.V)); setV(inputs.V);
    setCStr(String(Math.round(inputs.C * 10))); setC10(Math.round(inputs.C * 10));
    setAdStr(String(config.adBudgetMonthly)); setAdBudget(config.adBudgetMonthly);
  };

  const waHref = `https://wa.me/?text=${encodeURIComponent(`${title} — see the numbers here: ${resultUrl}`)}`;

  // Match each flagged role back to the actual question the respondent answered, so
  // the correction notice can point at a specific question instead of a vague role.
  // "read as 7%" + "if you meant 7 out of 10, that's 70%" is the whole diagnosis.
  const rateNow: Partial<Record<ClinicRole, number>> = {
    BOOK_RATE: original.bookRateNow,
    SHOWUP_RATE: original.showUpNow,
    CLOSE_RATE: original.closeRate,
  };
  const suspectQuestions = (answers ?? [])
    .flatMap((c) => c.rows)
    .filter((r) => r.role && original.suspectRoles.includes(r.role))
    .map((r) => {
      const asFraction = rateNow[r.role as ClinicRole] ?? 0;
      const asPercent = Math.round(asFraction * 100);
      // The near-universal cause: an "out of 10" answer typed into a percent field.
      // 7 read as 7% almost certainly meant 7-in-10 = 70%.
      const likelyMeant = asPercent > 0 && asPercent <= 10 ? `${asPercent} out of 10 (${asPercent * 10}%)` : null;
      return {
        text: r.text,
        answerLabel: r.answerLabel,
        readAs: `${asPercent}%`,
        likelyMeant,
      };
    });

  return (
    <div className="dl">
      <style dangerouslySetInnerHTML={{ __html: BRAND_CSS }} />
      <p className="eyebrow">{title}</p>

      {/* Incoherent inputs: fewer than one case a month, or a rate so low it's
          almost certainly a unit mix-up. Showing money figures here would be
          worse than showing nothing — "0 cases" next to a positive revenue reads
          as broken, and the underlying number is wrong anyway. Ask instead. */}
      {original.dataInconsistent ? (
        <div className="cap-lead" style={{ marginTop: 12 }}>
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>These numbers don&apos;t add up yet</h1>
          <p style={{ fontSize: 15 }}>
            From the answers given, your clinic works out to{" "}
            <strong>
              {original.casesNowExact < 1
                ? "less than one completed treatment a month"
                : "an unusually low conversion rate"}
            </strong>
            . A working clinic doesn&apos;t run below that, so the figures below were almost
            certainly entered in a different scale than the question expected.
          </p>

          {/* Name the EXACT questions to re-answer, with what they said and how it
              was read — a generic "one of your figures is wrong" is unactionable. */}
          {suspectQuestions.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Please re-check these answers:</p>
              {suspectQuestions.map((q, i) => (
                <div key={i} style={{ marginTop: 8, paddingLeft: 10, borderLeft: "3px solid var(--gold)" }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{q.text}</p>
                  <p style={{ fontSize: 14, color: "var(--muted)" }}>
                    You answered <strong>{q.answerLabel ?? "—"}</strong> — we read that as{" "}
                    <strong>{q.readAs}</strong>
                    {q.likelyMeant ? (
                      <>
                        . If you meant <strong>{q.likelyMeant}</strong>, that&apos;s the figure to
                        enter.
                      </>
                    ) : (
                      "."
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <p style={{ fontSize: 15, marginTop: 12 }}>
            Your other answers are listed under &ldquo;What you told us&rdquo; below — keep this page
            open, open the audit in a new window, and re-enter everything the same except the
            answers above.
          </p>
          {retakeUrl ? (
            <p style={{ marginTop: 12 }}>
              <a className="btn" href={retakeUrl} target="_blank" rel="noreferrer">
                Open the audit in a new window
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {!original.dataInconsistent ? (
        <h1 style={{ fontSize: 26, marginTop: 4 }}>Your numbers right now</h1>
      ) : null}

      {/* Everything money-related is withheld when the inputs are incoherent —
          a wrong figure presented confidently is worse than no figure at all. */}
      {!original.dataInconsistent ? (
      <>
      {/* Three figures */}
      <div className="figures" aria-live="polite">
        <div className="fig today">
          <div className="cap">Earning today</div>
          <div className="amt">{formatINR(whole.revenueNow)}</div>
          <div className="sub">{whole.patientsNow} patients from {result.enquiries} enquiries · {monthlyLabel(whole.revenueNow)}</div>
          <div className="sub num">{formatINR(whole.revenueNow * 12)} a year</div>
        </div>
        <div className="fig gap">
          <div className="cap">Lost in the gap</div>
          <div className="amt">{formatINR(whole.gap)}</div>
          <div className="sub">{whole.patientsGap} patients never reached · {monthlyLabel(whole.gap)}</div>
          <div className="sub num">{formatINR(whole.annualGap)} a year</div>
        </div>
        <div className="fig full">
          <div className="cap">Full potential</div>
          <div className="amt">{formatINR(whole.revenuePotential)}</div>
          <div className="sub">{whole.patientsPotential} patients at the same close rate</div>
        </div>
      </div>

      {/* Editable inputs — say plainly that they ARE editable; a gold underline
          alone doesn't tell anyone they may overwrite the figure. */}
      <div className="edit-lead">Change any of the figures below and see the effect.</div>
      {/* One short label per field, no per-field hint — three equal one-line labels
          keep the columns on a shared baseline instead of staggering by height. */}
      <div className="inputs">
        <div className={`field${eInvalid ? " invalid" : ""}`}>
          <label htmlFor="dl-e">Enquiries a month</label>
          <input id="dl-e" inputMode="numeric" pattern="[0-9]*" value={eStr}
            onChange={(e) => setEStr(e.target.value)} onBlur={commit} />
        </div>
        <div className={`field${vInvalid ? " invalid" : ""}`}>
          <label htmlFor="dl-v">Treatment value</label>
          <input id="dl-v" inputMode="numeric" pattern="[0-9]*" value={vStr}
            onChange={(e) => setVStr(e.target.value)} onBlur={commit} />
        </div>
        <div className={`field${cInvalid ? " invalid" : ""}`}>
          <label htmlFor="dl-c">Treatments taken per 10 meetings</label>
          <input id="dl-c" inputMode="numeric" pattern="[0-9]*" value={cStr}
            onChange={(e) => setCStr(e.target.value)} onBlur={commit} />
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
            {eTag ? <span className="assumed-tag">{eTag}</span> : null}
          </span>
        </div>
        <div className="calc-row op">
          <span>× Booking rate ({pctLabel(result.bookRateNow)}){bTag ? <span className="assumed-tag">{bTag}</span> : null}</span>
          <span className="num">= {fmtStep(todayTrail.booked)} booked</span>
        </div>
        <div className="calc-row op">
          <span>× Show-up rate ({pctLabel(result.showUpNow)}){sTag ? <span className="assumed-tag">{sTag}</span> : null}</span>
          <span className="num">= {fmtStep(todayTrail.attended)} attended</span>
        </div>
        <div className="calc-row op final">
          <span>
            × Close rate ({pctLabel(result.closeRate)})
            {cTag ? <span className="assumed-tag">{cTag}</span> : null}
          </span>
          <span className="num">
            = {caseToday.text} patient{caseToday.text === "1" ? "" : "s"}/month
            {caseToday.hint ? ` (${caseToday.hint})` : ""}
          </span>
        </div>
        <div className="calc-row op revenue">
          <span>
            × Treatment value ({formatINR(result.treatmentValue)})
            {vTag ? <span className="assumed-tag">{vTag}</span> : null}
          </span>
          <span className="num">= {formatINR(result.revenueNow)}/month</span>
        </div>
        {/* You can't treat a fraction of a person — show what that means in whole
            patients alongside the exact arithmetic. */}
        <div className="calc-row op rounded">
          <span>In whole patients</span>
          <span className="num">
            {roundPatients(todayTrail.cases)} patient
            {roundPatients(todayTrail.cases) === 1 ? "" : "s"}/month ={" "}
            {formatINR(roundedRevenue(todayTrail.cases, result.treatmentValue))}/month
          </span>
        </div>
      </div>

      <div className="calc" style={{ marginTop: 12 }}>
        <p className="calc-title pot">After AI automation that fixes response speed &amp; follow-up</p>
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
        <div className="calc-row op rounded">
          <span>In whole patients</span>
          <span className="num">
            {roundPatients(potTrail.cases)} patient
            {roundPatients(potTrail.cases) === 1 ? "" : "s"}/month ={" "}
            {formatINR(roundedRevenue(potTrail.cases, result.treatmentValue))}/month
          </span>
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

      {/* Performance-marketing offer: what a fixed budget adds ON TOP of today. */}
      <div className="block">
        <h2>With performance marketing</h2>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>
          At {formatINR(liveConfig.costPerEnquiry)} per enquiry, converted at the improved booking
          and show-up rates and your own close rate, unchanged.
        </p>
        <div className="field" style={{ maxWidth: 260, marginTop: 10 }}>
          <label htmlFor="dl-ad">Ad budget a month — change it to see the figures move</label>
          <input
            id="dl-ad"
            inputMode="numeric"
            pattern="[0-9]*"
            value={adStr}
            onChange={(e) => setAdStr(e.target.value)}
            onBlur={commit}
          />
          <div className="hint">Try your own number. Everything below recalculates.</div>
        </div>
        <div className="calc" style={{ marginTop: 10 }}>
          <div className="calc-row">
            <span>Ad budget</span>
            <span className="num">{formatINR(result.performance.adBudget)}/month</span>
          </div>
          <div className="calc-row op">
            <span>÷ Cost per enquiry ({formatINR(liveConfig.costPerEnquiry)})</span>
            <span className="num">= {fmtStep(result.performance.enquiries)} new enquiries</span>
          </div>
          <div className="calc-row op">
            <span>× Booking rate ({pctLabel(result.bookRateImproved)})</span>
            <span className="num">= {fmtStep(pmTrail.booked)} booked</span>
          </div>
          <div className="calc-row op">
            <span>× Show-up rate ({pctLabel(result.showUpImproved)})</span>
            <span className="num">= {fmtStep(pmTrail.attended)} attended</span>
          </div>
          <div className="calc-row op final">
            <span>× Close rate ({pctLabel(result.closeRate)}, unchanged)</span>
            <span className="num">= {fmtStep(pmTrail.cases)} patients/month</span>
          </div>
          <div className="calc-row op revenue pot">
            <span>× Treatment value ({formatINR(result.treatmentValue)})</span>
            <span className="num">= {formatINR(result.performance.revenue)}/month</span>
          </div>
          <div className="calc-row op rounded">
            <span>In whole patients</span>
            <span className="num">
              {whole.patientsPm} patient{whole.patientsPm === 1 ? "" : "s"}/month ={" "}
              {formatINR(whole.revenuePm)}/month
            </span>
          </div>
        </div>
        <p style={{ fontSize: 14, marginTop: 8 }}>
          <strong>This is additional</strong> — over and above what your clinic earns today.
        </p>
      </div>

      {/* The three stages, side by side, so the progression is unmissable. */}
      <div className="block">
        <h2>What you gain</h2>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>
          The same clinic at each stage. Your enquiries today, the same enquiries once AI automation
          answers and follows them up, then performance marketing on top.
        </p>
        <div className="ladder">
          <div className="rung">
            <span className="rung-cap">Today</span>
            <span className="rung-amt num">{formatINR(whole.revenueNow)}</span>
            <span className="rung-sub">
              {whole.patientsNow} patient{whole.patientsNow === 1 ? "" : "s"} a month
            </span>
          </div>
          <div className="rung mid">
            <span className="rung-cap">After AI automation</span>
            <span className="rung-amt num">{formatINR(whole.revenuePotential)}</span>
            <span className="rung-sub">
              {whole.patientsPotential} patient{whole.patientsPotential === 1 ? "" : "s"} a month — same
              enquiries, nothing bought
            </span>
          </div>
          <div className="rung top">
            <span className="rung-cap">+ performance marketing ({formatINR(result.performance.adBudget)} ads)</span>
            <span className="rung-amt num">{formatINR(whole.combined)}</span>
            <span className="rung-sub">
              {whole.patientsTop} patient{whole.patientsTop === 1 ? "" : "s"} a month
            </span>
          </div>
        </div>

        <div className="calc" style={{ marginTop: 14 }}>
          <div className="calc-row">
            <span>Gross at the top stage</span>
            <span className="num">{formatINR(whole.combined)}/month</span>
          </div>
          <div className="calc-row op">
            <span>− Performance marketing fee</span>
            <span className="num">− {formatINR(result.performance.serviceFee)}/month</span>
          </div>
          <div className="calc-row op">
            <span>− Ad budget</span>
            <span className="num">− {formatINR(result.performance.adBudget)}/month</span>
          </div>
          <div className="calc-row op revenue">
            <span>= What you keep</span>
            <span className="num">{formatINR(whole.netTotal)}/month</span>
          </div>
        </div>
        {whole.netGain > 0 ? (
          <p className="verdict">
            You spend {formatINR(whole.investment)} a month. You keep {formatINR(whole.netTotal)}.
            That is <strong>{formatINR(whole.netGain)} a month more profit</strong> than you make
            today — {formatINR(whole.netGain * 12)} over a year.
          </p>
        ) : null}
      </div>

      {/* Dormant database */}
      {result.dormant.recoverable > 0 ? (
        <div className="block">
          <h2>The unattended gold mine in your clinic</h2>
          <p>
            You are already sitting on <span className="num">{result.dormant.recoverable}</span> recoverable
            cases &mdash; <span className="num">{formatINR(result.dormant.value)}</span>{dTag ? <span className="assumed-tag">{dTag}</span> : null} of
            treatment value in enquiries you have already paid for and nobody has called back. It
            costs you nothing in ads to go and get it. This is the first-fortnight number, and it is
            deliberately conservative.
          </p>
        </div>
      ) : null}
      </>
      ) : null}

      {/* What they told us — every figure above is derived from these answers, so
          showing them back makes a mis-tap or typo findable rather than silent. */}
      {answers && answers.length > 0 ? (
        <div className="block">
          <h2>What you told us</h2>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>
            Every number above is calculated from these answers. If any of them is wrong, retake the
            audit and the figures will update.
          </p>
          {answers.map((cat) => (
            <div key={cat.name} style={{ marginTop: 10 }}>
              <p style={{ fontWeight: 600, fontSize: 14 }}>{cat.name}</p>
              {cat.rows.map((r, i) => (
                <div key={i} className="calc-row">
                  <span style={{ maxWidth: "62%" }}>{r.text}</span>
                  <span className="num">{r.answerLabel ?? "—"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* Close: book the appointment, and forward it to whoever decides. The calendar
          is deliberately NOT embedded here — it loads a heavy third-party frame in the
          middle of the argument and pulls attention off the numbers. The button opens
          it in its own tab instead. */}
      <div className="block">
        <h2>Talk it through</h2>
        <p>Book a 1-on-1 video call with our expert to walk through these numbers for your clinic.</p>
        {/* Forward-on sits left, the booking CTA is pushed to the right edge so it
            lands on the same margin as every figure above it. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, justifyContent: "space-between" }}>
          <a className="btn wa" href={waHref} target="_blank" rel="noreferrer">Send this to the clinic owner</a>
          {bookingUrl ? (
            <a className="btn" href={bookingUrl} target="_blank" rel="noreferrer">Book an appointment</a>
          ) : null}
        </div>
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

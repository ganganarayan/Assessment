/**
 * Clinic Audit engine verification (no DB). Exercises the pure funnel math in
 * src/lib/scoring/clinic-audit.ts: bands, the two overrides, the "don't know"
 * assumptions, the 0.38 book-rate cap, the five-case chain, dormant recovery,
 * and the load-bearing invariant that close rate is HELD CONSTANT.
 *
 *   npx tsx scripts/verify-clinic-audit.ts   (or: npm run verify:clinic)
 */
import {
  DEFAULT_ENGINE_CONFIG,
  resolveEngineConfig,
  scoreClinicAudit,
  type RawAnswer,
  type ClinicRole,
} from "../src/lib/scoring/clinic-audit";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

const cfg = DEFAULT_ENGINE_CONFIG;

// Build RawAnswer[] from a compact spec. Rates/uplift are WHOLE PERCENT (32 = 0.32).
interface Spec {
  E: number;
  B: number;
  S: number;
  C: number;
  V: number;
  A?: number;
  D: number;
  K: number;
  uplifts?: number[]; // UPLIFT_BOOKRATE option values (whole percent)
  dontKnow?: ClinicRole[]; // roles answered "I don't know"
  actual?: Partial<Record<ClinicRole, number>>; // respondent-typed exact numbers
  labels?: Partial<Record<ClinicRole, string>>; // selected option's label text
}
function build(s: Spec): RawAnswer[] {
  const dk = new Set(s.dontKnow ?? []);
  const actual = s.actual ?? {};
  const labels = s.labels ?? {};
  const mk = (role: ClinicRole, value: number): RawAnswer => ({
    role,
    value,
    isAssumption: dk.has(role),
    actualValue: actual[role] ?? null,
    optionLabel: labels[role] ?? null,
  });
  const a: RawAnswer[] = [
    mk("ENQUIRIES", s.E),
    mk("BOOK_RATE", s.B),
    mk("SHOWUP_RATE", s.S),
    mk("CLOSE_RATE", s.C),
    mk("TREATMENT_VALUE", s.V),
    mk("AD_SPEND", s.A ?? 0),
    mk("DORMANT", s.D),
    mk("CAPACITY", s.K),
  ];
  for (const u of s.uplifts ?? []) a.push({ role: "UPLIFT_BOOKRATE", value: u, clause: `uplift ${u}` });
  return a;
}
const score = (s: Spec) => scoreClinicAudit(build(s), cfg);

console.log("Clinic Audit engine verification\n");

// --- Bands -----------------------------------------------------------------
{
  const r = score({ E: 300, B: 12, S: 35, C: 25, V: 300000, A: 250000, D: 1500, K: 30, uplifts: [6, 5, 6, 3] });
  expect("CRITICAL band (gap ≥ ₹10L)", r.band === "CRITICAL", `band=${r.band} gap=${r.gap}`);
  expect("  casesNow rounded", r.casesNow === 3, `casesNow=${r.casesNow}`);
  expect("  revenueNow exact", r.revenueNow === 945000, `revenueNow=${r.revenueNow}`);
  expect("  bookRateImproved = 0.12+0.20", Math.abs(r.bookRateImproved - 0.32) < 1e-9, `b'=${r.bookRateImproved}`);
  expect("  showUp lifted to target", Math.abs(r.showUpImproved - 0.8) < 1e-9, `s'=${r.showUpImproved}`);
  expect("  gap = 48,15,000", r.gap === 4815000, `gap=${r.gap}`);
  expect("  annualGap = gap×12", r.annualGap === r.gap * 12, `annual=${r.annualGap}`);
  expect("  dormant recoverable floor(1500×2%)", r.dormant.recoverable === 30, `rec=${r.dormant.recoverable}`);
  expect("  not viable / not capacity-blocked", !r.notViable && !r.capacityBlocked);
}
{
  const r = score({ E: 90, B: 20, S: 55, C: 30, V: 185000, D: 350, K: 17, uplifts: [6, 6] });
  expect("HIGH band (₹5L–₹10L)", r.band === "HIGH", `band=${r.band} gap=${r.gap}`);
}
{
  const r = score({ E: 90, B: 20, S: 55, C: 30, V: 90000, D: 350, K: 17, uplifts: [6, 6] });
  expect("MODERATE band (₹2L–₹5L)", r.band === "MODERATE", `band=${r.band} gap=${r.gap}`);
}
{
  // Well-performing clinic: fast + high rates, no uplift awarded, gap ≈ 0.
  const r = score({ E: 90, B: 45, S: 95, C: 65, V: 90000, D: 100, K: 30 });
  expect("BELOW_THRESHOLD (well-run, gap≈0)", r.band === "BELOW_THRESHOLD", `band=${r.band} gap=${r.gap}`);
  expect("  no uplift → gap = 0", r.gap === 0, `gap=${r.gap}`);
  expect("  cap never lowers B (0.45 kept)", Math.abs(r.bookRateImproved - 0.45) < 1e-9, `b'=${r.bookRateImproved}`);
  expect("  show-up ≥0.75 unchanged", Math.abs(r.showUpImproved - 0.95) < 1e-9, `s'=${r.showUpImproved}`);
}

// --- Overrides -------------------------------------------------------------
{
  const r = score({ E: 20, B: 20, S: 55, C: 30, V: 90000, D: 350, K: 17, uplifts: [6, 6] });
  expect("override: under-30 enquiries → notViable", r.notViable, `E under min`);
  expect("  notViable forces BELOW_THRESHOLD", r.band === "BELOW_THRESHOLD", `band=${r.band}`);
}
{
  const r = score({ E: 300, B: 20, S: 55, C: 30, V: 18000, D: 350, K: 17, uplifts: [6, 6] });
  expect("override: ticket < ₹25k → notViable", r.notViable, `V under min`);
}
{
  // Otherwise-CRITICAL clinic but no spare capacity.
  const r = score({ E: 300, B: 12, S: 35, C: 25, V: 300000, D: 1500, K: 3, uplifts: [6, 5, 6, 3] });
  expect("override: capacity < 5 → capacityBlocked", r.capacityBlocked, `K under min`);
  expect("  computed band kept (CRITICAL) while blocked", r.band === "CRITICAL", `band=${r.band}`);
}

// --- Low-enquiries override steps aside for a large ANNUAL gap -------------
{
  // E just under min (25 < 30), but a high ticket + real uplift produce a big
  // annual gap — the low-enquiries not-viable override should waive, and the
  // band should be computed normally from the (still real) monthly gap.
  const r = score({ E: 25, B: 12, S: 35, C: 25, V: 300000, D: 1500, K: 30, uplifts: [6, 5, 6, 3] });
  expect("large annual gap waives low-enquiries not-viable", !r.notViable, `notViable=${r.notViable} gap=${r.gap}`);
  expect("  band computed normally, not forced BELOW_THRESHOLD", r.band !== "BELOW_THRESHOLD", `band=${r.band}`);
}
{
  // E under min, but the gap is genuinely small — override must NOT waive it.
  const r = score({ E: 20, B: 12, S: 35, C: 30, V: 50000, D: 1500, K: 10 });
  expect("small annual gap keeps low-enquiries not-viable", r.notViable, `notViable=${r.notViable} gap=${r.gap}`);
  expect("  band forced BELOW_THRESHOLD", r.band === "BELOW_THRESHOLD", `band=${r.band}`);
}
{
  // Low TICKET (not enquiries) is never waived by the gap — different economics.
  const r = score({ E: 300, B: 45, S: 95, C: 65, V: 18000, D: 1500, K: 30 });
  expect("low-ticket not-viable is absolute (no gap override)", r.notViable, `notViable=${r.notViable}`);
}

// --- 0.38 book-rate cap ----------------------------------------------------
{
  const r = score({ E: 90, B: 20, S: 55, C: 30, V: 90000, D: 350, K: 17, uplifts: [10, 10, 10] });
  expect("book-rate uplift capped at 0.38", Math.abs(r.bookRateImproved - 0.38) < 1e-9, `b'=${r.bookRateImproved}`);
}

// --- "Don't know" assumptions ---------------------------------------------
{
  // TREATMENT_VALUE and AD_SPEND get an actual number here so ONLY the 6 "don't
  // know" roles remain assumed (an actual number, when given, is never assumed).
  const r = score({
    E: 60, B: 18, S: 60, C: 30, V: 90000, D: 400, K: 10,
    dontKnow: ["ENQUIRIES", "BOOK_RATE", "SHOWUP_RATE", "CLOSE_RATE", "DORMANT", "CAPACITY"],
    actual: { TREATMENT_VALUE: 90000, AD_SPEND: 15000 },
  });
  expect("assumptions surfaced for every 'don't know'", r.assumptions.length === 6, `n=${r.assumptions.length}`);
  expect("  includes 'monthly enquiries'", r.assumptions.includes("monthly enquiries"));
  expect("  includes 'close rate'", r.assumptions.includes("close rate"));
}

// --- Actual-number override (respondent typed an exact figure) -------------
{
  // 90 is the "60–120" range midpoint; the respondent actually knows it's 73.
  const raw = build({ E: 90, B: 20, S: 55, C: 30, V: 90000, D: 350, K: 17 });
  raw[0] = { ...raw[0]!, actualValue: 73, optionLabel: "60–120" };
  const r = scoreClinicAudit(raw, cfg);
  expect("actual number overrides the range midpoint", r.enquiries === 73, `E=${r.enquiries}`);
  expect("  an actual number is never tagged assumed", !r.assumptions.includes("monthly enquiries"));
}
{
  // A real range was picked (NOT "I don't know") but no actual number was typed —
  // must still read as an assumption, with the range label carried for the UI tag.
  const raw = build({ E: 90, B: 20, S: 55, C: 30, V: 90000, D: 350, K: 17 });
  raw[0] = { ...raw[0]!, optionLabel: "60–120" }; // no actualValue, not flagged "don't know" either
  const r = scoreClinicAudit(raw, cfg);
  expect("blank actual number still tags the range as assumed", r.assumptions.includes("monthly enquiries"));
  expect("  range label carried through for the UI tag", r.assumedRangeLabel.ENQUIRIES === "60–120", `label=${r.assumedRangeLabel.ENQUIRIES}`);
}

// --- Unit handling (the 10x bug that produced 100x-wrong revenue) ----------
{
  // The exact live failure: a question worded "out of every 10" answered 7 and 2,
  // read as percentages. Reproduces the wrong result when the unit isn't declared.
  const raw = build({ E: 100, B: 10, S: 7, C: 2, V: 100000, D: 1500, K: 10 });
  const r = scoreClinicAudit(raw, cfg);
  expect("undeclared unit still reads rates as percent (back-compat)", Math.abs(r.showUpNow - 0.07) < 1e-9, `S=${r.showUpNow}`);
  expect("  the absurd result is flagged inconsistent", r.dataInconsistent, `casesNow=${r.casesNowExact}`);
  expect("  the implausible rates are named", r.suspectRoles.includes("SHOWUP_RATE") && r.suspectRoles.includes("CLOSE_RATE"), `${r.suspectRoles.join()}`);
}
{
  // Same answers, but the questions declare PER_10 — 7 now means 70%, 2 means 20%.
  const raw = build({ E: 100, B: 10, S: 7, C: 2, V: 100000, D: 1500, K: 10 }).map((a) =>
    a.role === "SHOWUP_RATE" || a.role === "CLOSE_RATE" ? { ...a, unit: "PER_10" as const } : a,
  );
  const r = scoreClinicAudit(raw, cfg);
  expect("PER_10 unit reads 7 as 70%", Math.abs(r.showUpNow - 0.7) < 1e-9, `S=${r.showUpNow}`);
  expect("  and 2 as 20%", Math.abs(r.closeRate - 0.2) < 1e-9, `C=${r.closeRate}`);
  expect("  revenue is 100x the mis-scaled figure", r.revenueNow === 140000, `revenueNow=${r.revenueNow}`);
  expect("  a real clinic is NOT flagged inconsistent", !r.dataInconsistent, `casesNow=${r.casesNowExact}`);
}
{
  // Rupee/count roles are unaffected by unit conversion.
  const raw = build({ E: 90, B: 20, S: 55, C: 30, V: 90000, D: 350, K: 17 });
  const r = scoreClinicAudit(raw, cfg);
  expect("rupees pass through unconverted", r.treatmentValue === 90000, `V=${r.treatmentValue}`);
  expect("counts pass through unconverted", r.enquiries === 90, `E=${r.enquiries}`);
}
{
  // Under one case a month is incoherent even when every rate looks plausible.
  const r = score({ E: 2, B: 20, S: 55, C: 30, V: 90000, D: 100, K: 10 });
  expect("under 1 case/month flags inconsistent", r.dataInconsistent, `casesNow=${r.casesNowExact}`);
}

// --- Five-case chain (deterministic) --------------------------------------
{
  // C=0.65, S=0.95, bImproved=0.45 → attended 8, booked 9, enquiries 18, spend ₹9,000.
  const r = score({ E: 90, B: 45, S: 95, C: 65, V: 90000, D: 100, K: 30 });
  expect("five-case attended = ceil(5/0.65)", r.fiveCases.attended === 8, `att=${r.fiveCases.attended}`);
  expect("five-case booked", r.fiveCases.booked === 9, `bk=${r.fiveCases.booked}`);
  expect("five-case enquiries", r.fiveCases.enquiries === 18, `enq=${r.fiveCases.enquiries}`);
  expect("five-case adSpend = enq×₹500", r.fiveCases.adSpend === 9000, `spend=${r.fiveCases.adSpend}`);
}

// --- Close rate HELD CONSTANT (every scenario) -----------------------------
{
  const specs: Spec[] = [
    { E: 300, B: 12, S: 35, C: 25, V: 300000, D: 1500, K: 30, uplifts: [6, 5, 6, 3] },
    { E: 90, B: 20, S: 55, C: 30, V: 185000, D: 350, K: 17, uplifts: [6, 6] },
    { E: 90, B: 45, S: 95, C: 65, V: 90000, D: 100, K: 30 },
    { E: 60, B: 18, S: 60, C: 30, V: 90000, D: 400, K: 10 },
  ];
  const allHeld = specs.every((s) => Math.abs(score(s).closeRate - s.C / 100) < 1e-9);
  expect("close rate identical current↔potential in every case", allHeld, "closeRate must equal input C");
}

// --- Config resolver --------------------------------------------------------
{
  const merged = resolveEngineConfig({ costPerEnquiry: 750, bogus: "x" });
  expect("resolveEngineConfig overrides costPerEnquiry", merged.costPerEnquiry === 750, `${merged.costPerEnquiry}`);
  expect("  keeps defaults for the rest", merged.bookRateCap === 0.38, `${merged.bookRateCap}`);
  expect("  ignores unknown/invalid keys", !("bogus" in merged));
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);

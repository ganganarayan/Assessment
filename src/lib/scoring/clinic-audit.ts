/**
 * Divine Leads — Clinic Patient-Acquisition Audit: pure scoring engine.
 *
 * DATA-DRIVEN, NOT HARDCODED. The 23 questions live in the normal builder; each
 * scored question carries a `scoringRole` and each option a working number
 * (`Option.value`). This module knows only the funnel MATH — never the questions.
 *
 * PURE. No DB, no `server-only`, no env reads. The same functions run on the
 * server (initial render + snapshot) and in the browser (the editable calculator),
 * so the two can never diverge. A thin server adapter maps SubmissionAnswer rows
 * into `RawAnswer[]`; everything below operates on plain numbers.
 *
 * The model (all figures computed here, never by the LLM):
 *   casesNow    = E × B × S × C          revenueNow    = casesNow × V
 *   book uplift = Σ configured points, capped at bookRateCap, never below B
 *   show-up     = S < improveBelow ? target : S
 *   CLOSE RATE C IS HELD CONSTANT — current and potential. This is load-bearing.
 *   gap         = revenuePotential − revenueNow
 */

// ---------------------------------------------------------------------------
// Roles + config
// ---------------------------------------------------------------------------

export const CLINIC_ROLES = [
  "ENQUIRIES", // E — new patient enquiries / month (count)
  "BOOK_RATE", // B — % of enquiries that book (whole percent, 32 = 0.32)
  "SHOWUP_RATE", // S — % of bookings that attend (whole percent)
  "CLOSE_RATE", // C — % of attended that go ahead (whole percent) — HELD CONSTANT
  "TREATMENT_VALUE", // V — average value of one completed treatment (rupees)
  "AD_SPEND", // A — monthly ad spend (rupees, context only)
  "DORMANT", // D — dormant enquiries sitting uncontacted (count)
  "CAPACITY", // K — spare cases/month without hiring (count)
  "UPLIFT_BOOKRATE", // book-rate points this answer awards (whole percent, 6 = +0.06)
] as const;

export type ClinicRole = (typeof CLINIC_ROLES)[number];

export function isClinicRole(v: string | null | undefined): v is ClinicRole {
  return !!v && (CLINIC_ROLES as readonly string[]).includes(v);
}

/** Roles whose stored option value is a whole-number percent → divided by 100. */
const RATE_ROLES = new Set<ClinicRole>(["BOOK_RATE", "SHOWUP_RATE", "CLOSE_RATE", "UPLIFT_BOOKRATE"]);

export interface EngineConfig {
  costPerEnquiry: number; // ₹ per enquiry for the five-case ad-spend estimate
  bookRateCap: number; // book rate can never be modelled above this
  showUpTarget: number; // show-up lifted to this when below the threshold
  showUpImproveBelow: number; // …only when current show-up is below this
  minEnquiries: number; // below this E → notViable
  minTicket: number; // below this V → notViable
  capacityBlockedBelow: number; // below this K → capacityBlocked
  bandCritical: number; // gap ≥ this → CRITICAL
  bandHigh: number; // gap ≥ this → HIGH
  bandModerate: number; // gap ≥ this → MODERATE (else BELOW_THRESHOLD)
  dormantRate: number; // fraction of the dormant list treated as recoverable
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  costPerEnquiry: 500,
  bookRateCap: 0.38,
  showUpTarget: 0.8,
  showUpImproveBelow: 0.75,
  minEnquiries: 30,
  minTicket: 25000,
  capacityBlockedBelow: 5,
  bandCritical: 1_000_000,
  bandHigh: 500_000,
  bandModerate: 200_000,
  dormantRate: 0.02,
};

/** Merge a stored (partial, possibly malformed) engineConfig JSON over the defaults. */
export function resolveEngineConfig(raw: unknown): EngineConfig {
  const out: EngineConfig = { ...DEFAULT_ENGINE_CONFIG };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(DEFAULT_ENGINE_CONFIG) as (keyof EngineConfig)[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One selected answer, already reduced to its role + working number. */
export interface RawAnswer {
  role: ClinicRole;
  value: number; // Option.value as stored (rupees/counts as-is, rates as whole %)
  isAssumption?: boolean; // the "I don't know" option
  clause?: string | null; // Option.diagnosisClause for weakest-area text
}

/** Normalized numeric inputs the math runs on. Rates are fractions (0..1). */
export interface ClinicInputs {
  E: number;
  B: number;
  S: number;
  C: number;
  V: number;
  A: number;
  D: number;
  K: number;
  bookUpliftPoints: number; // summed uplift, in rate units (0.06, …)
  assumptions: string[]; // friendly labels of inputs answered "don't know"
  weakest: WeakArea[]; // candidate weakest areas, worst-first (top 2 used)
}

export interface WeakArea {
  key: ClinicRole;
  clause: string;
  severity: number; // higher = worse; used only for ranking
}

const ROLE_LABEL: Record<ClinicRole, string> = {
  ENQUIRIES: "monthly enquiries",
  BOOK_RATE: "booking rate",
  SHOWUP_RATE: "show-up rate",
  CLOSE_RATE: "close rate",
  TREATMENT_VALUE: "treatment value",
  AD_SPEND: "ad spend",
  DORMANT: "dormant list size",
  CAPACITY: "spare capacity",
  UPLIFT_BOOKRATE: "response and follow-up",
};

function toWorking(role: ClinicRole, value: number): number {
  return RATE_ROLES.has(role) ? value / 100 : value;
}

/**
 * Reduce the selected answers to normalized numeric inputs. Later answers for a
 * role win (there should be one each, except UPLIFT_BOOKRATE which sums). Missing
 * inputs default to 0 — the overrides/guards in computeResult handle that safely.
 */
export function deriveInputs(answers: RawAnswer[], config: EngineConfig): ClinicInputs {
  const base: Partial<Record<ClinicRole, number>> = {};
  const assumptions: string[] = [];
  const weakest: WeakArea[] = [];
  let bookUpliftPoints = 0;

  for (const a of answers) {
    if (!isClinicRole(a.role)) continue;
    const working = toWorking(a.role, a.value);

    if (a.role === "UPLIFT_BOOKRATE") {
      bookUpliftPoints += working;
      if (a.clause && working > 0) {
        weakest.push({ key: a.role, clause: a.clause, severity: working });
      }
      continue;
    }

    base[a.role] = working;
    if (a.isAssumption) assumptions.push(ROLE_LABEL[a.role]);

    // Rate answers below their benchmark are weakness candidates when clause-tagged.
    if (a.clause) {
      let severity = 0;
      if (a.role === "BOOK_RATE") severity = Math.max(0, config.bookRateCap - working);
      else if (a.role === "SHOWUP_RATE") severity = Math.max(0, config.showUpTarget - working);
      if (severity > 0) weakest.push({ key: a.role, clause: a.clause, severity });
    }
  }

  weakest.sort((x, y) => y.severity - x.severity);

  return {
    E: base.ENQUIRIES ?? 0,
    B: base.BOOK_RATE ?? 0,
    S: base.SHOWUP_RATE ?? 0,
    C: base.CLOSE_RATE ?? 0,
    V: base.TREATMENT_VALUE ?? 0,
    A: base.AD_SPEND ?? 0,
    D: base.DORMANT ?? 0,
    K: base.CAPACITY ?? 0,
    bookUpliftPoints,
    assumptions,
    weakest,
  };
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type ClinicBand = "CRITICAL" | "HIGH" | "MODERATE" | "BELOW_THRESHOLD";

/**
 * Maps the clinic ₹-gap band to the assessment's own Result Band LEVEL
 * (CRITICAL/HIGH/MEDIUM/LOW), so the author's own title/description
 * ("Running on Luck", "Engine Running", …) can be looked up and shown. This is
 * the SINGLE source of truth for that mapping — every call site (scoring at
 * completion, the result page, the PDF) must use this, never re-derive it, so
 * the band shown can never drift between views of the same submission.
 */
export const CLINIC_BAND_TO_LEVEL: Record<ClinicBand, string> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MODERATE: "MEDIUM",
  BELOW_THRESHOLD: "LOW",
};

/** Look up the author's Result Band row matching a clinic band, by level. */
export function matchClinicResultBand<T extends { level: string }>(
  clinicBand: ClinicBand,
  resultBands: readonly T[],
): T | null {
  const level = CLINIC_BAND_TO_LEVEL[clinicBand];
  return resultBands.find((b) => b.level === level) ?? null;
}

export interface ClinicAuditResult {
  casesNow: number; // rounded for display
  revenueNow: number; // rupees/month, from UNROUNDED cases
  casesPotential: number;
  revenuePotential: number;
  gap: number; // revenuePotential − revenueNow
  annualGap: number;
  bookRateNow: number;
  bookRateImproved: number;
  showUpNow: number;
  showUpImproved: number;
  closeRate: number; // identical in current + potential, always
  enquiries: number;
  treatmentValue: number;
  adSpend: number;
  fiveCases: { attended: number; booked: number; enquiries: number; adSpend: number };
  dormant: { count: number; recoverable: number; value: number };
  capacity: number;
  band: ClinicBand;
  notViable: boolean;
  capacityBlocked: boolean;
  weakestAreas: { key: ClinicRole; clause: string }[];
  assumptions: string[];
}

function round(n: number): number {
  return Math.round(n);
}

/** Compute the full result from normalized inputs. Pure — safe on the client. */
export function computeResult(inputs: ClinicInputs, config: EngineConfig): ClinicAuditResult {
  const { E, B, S, C, V, D, K } = inputs;

  // Current state — revenue is computed on UNROUNDED cases.
  const casesNowExact = E * B * S * C;
  const revenueNow = round(casesNowExact * V);

  // Book-rate uplift: additive, capped, never below the current rate.
  const bImproved = Math.max(B, Math.min(B + inputs.bookUpliftPoints, config.bookRateCap));
  // Show-up uplift: reminder ladder lifts a weak show-up to the target.
  const sImproved = S < config.showUpImproveBelow ? config.showUpTarget : S;
  // Close rate C is NEVER improved. Held constant on both sides.

  const casesPotentialExact = E * bImproved * sImproved * C;
  const revenuePotential = round(casesPotentialExact * V);
  const gap = revenuePotential - revenueNow;

  // Five-case chain — uses the clinic's OWN show-up and close rates.
  const safe = (x: number) => (x > 0 ? x : NaN);
  const attendedExact = 5 / safe(C);
  const bookedExact = attendedExact / safe(S);
  const enquiriesExact = bookedExact / safe(bImproved);
  const ceilOr0 = (x: number) => (Number.isFinite(x) ? Math.ceil(x) : 0);
  const fiveEnquiries = ceilOr0(enquiriesExact);
  const fiveCases = {
    attended: ceilOr0(attendedExact),
    booked: ceilOr0(bookedExact),
    enquiries: fiveEnquiries,
    adSpend: fiveEnquiries * config.costPerEnquiry,
  };

  // Dormant database — deliberately conservative.
  const dormantRecoverable = Math.floor(D * config.dormantRate);
  const dormant = { count: D, recoverable: dormantRecoverable, value: dormantRecoverable * V };

  // Overrides first, then band on gap.
  const notViable = E < config.minEnquiries || V < config.minTicket;
  const capacityBlocked = K < config.capacityBlockedBelow;
  let band: ClinicBand;
  if (notViable) band = "BELOW_THRESHOLD";
  else if (gap >= config.bandCritical) band = "CRITICAL";
  else if (gap >= config.bandHigh) band = "HIGH";
  else if (gap >= config.bandModerate) band = "MODERATE";
  else band = "BELOW_THRESHOLD";

  return {
    casesNow: round(casesNowExact),
    revenueNow,
    casesPotential: round(casesPotentialExact),
    revenuePotential,
    gap,
    annualGap: gap * 12,
    bookRateNow: B,
    bookRateImproved: bImproved,
    showUpNow: S,
    showUpImproved: sImproved,
    closeRate: C,
    enquiries: E,
    treatmentValue: V,
    adSpend: inputs.A,
    fiveCases,
    dormant,
    capacity: K,
    band,
    notViable,
    capacityBlocked,
    weakestAreas: inputs.weakest.slice(0, 2).map((w) => ({ key: w.key, clause: w.clause })),
    assumptions: inputs.assumptions,
  };
}

/** Convenience: raw answers → result in one call (server initial render). */
export function scoreClinicAudit(answers: RawAnswer[], config: EngineConfig): ClinicAuditResult {
  return computeResult(deriveInputs(answers, config), config);
}

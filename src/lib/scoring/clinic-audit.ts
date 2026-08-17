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

/** Roles whose working value is a RATE (a 0..1 fraction) rather than a raw count/₹. */
const RATE_ROLES = new Set<ClinicRole>(["BOOK_RATE", "SHOWUP_RATE", "CLOSE_RATE", "UPLIFT_BOOKRATE"]);

/**
 * The unit a question's numbers are expressed in. Declared per question in the
 * builder and applied to BOTH the option values and the respondent's typed actual
 * number — so a question worded "out of every 10" can never be read as a percent.
 *
 * This exists because that exact ambiguity produced a 10x error per rate (100x on
 * revenue): a question asking "out of every 10 booked consultations, how many
 * attend?" invites the answer 7, which as a percent is 7% rather than 70%.
 */
export const CLINIC_UNITS = ["PER_10", "PER_100", "RUPEES", "COUNT", "POINTS"] as const;
export type ClinicUnit = (typeof CLINIC_UNITS)[number];

export function isClinicUnit(v: string | null | undefined): v is ClinicUnit {
  return !!v && (CLINIC_UNITS as readonly string[]).includes(v);
}

/** The unit a role uses when the question doesn't declare one. Rates default to
 *  PER_100, which is exactly how every pre-existing configuration was read. */
export function defaultUnitForRole(role: ClinicRole): ClinicUnit {
  if (role === "UPLIFT_BOOKRATE") return "POINTS";
  if (RATE_ROLES.has(role)) return "PER_100";
  if (role === "TREATMENT_VALUE" || role === "AD_SPEND") return "RUPEES";
  return "COUNT";
}

/** Convert a stored/typed number in `unit` into the engine's working value
 *  (rates as a 0..1 fraction; counts and rupees as-is). */
export function toWorkingValue(value: number, unit: ClinicUnit): number {
  switch (unit) {
    case "PER_10":
      return value / 10;
    case "PER_100":
    case "POINTS":
      return value / 100;
    default:
      return value;
  }
}

/**
 * Lowest rate we treat as believable for a real clinic. Below this the input is
 * almost certainly a unit mix-up (7 meaning "7 out of 10" read as 7%) rather than
 * a genuine figure, so it's surfaced instead of silently producing absurd revenue.
 */
export const RATE_PLAUSIBILITY_FLOOR: Partial<Record<ClinicRole, number>> = {
  BOOK_RATE: 0.02,
  SHOWUP_RATE: 0.15,
  CLOSE_RATE: 0.05,
};

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
  // A clinic under minEnquiries is presumed too small to be a real prospect — UNLESS
  // the implied ANNUAL gap clears this bar, in which case the low-enquiries override
  // steps aside and the normal band ladder (on the monthly gap) decides instead. Does
  // NOT apply to the minTicket override (a genuinely low-ticket clinic stays not-viable
  // regardless of gap — that economics doesn't suit a retainer either way).
  notViableAnnualGapOverride: number;
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
  notViableAnnualGapOverride: 1_000_000, // ₹10L/year
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
  value: number; // Option.value as stored — the RANGE MIDPOINT/fallback (rupees/counts
  // as-is, rates as whole %); used only when actualValue is absent.
  /** The respondent's own exact number, if they typed one — takes precedence over
   *  `value` (the range midpoint) whenever present. Not applicable to UPLIFT_BOOKRATE. */
  actualValue?: number | null;
  /** The selected option's label text (e.g. "30–60", "I don't know") — shown in the
   *  "(assumed — average of X)" tag whenever actualValue is absent. */
  optionLabel?: string | null;
  /** The question's declared unit; absent = the role's default (back-compatible). */
  unit?: ClinicUnit | null;
  isAssumption?: boolean; // the "I don't know" option specifically
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
  /** Friendly labels of every numeric role where NO actual number was typed — the
   *  range midpoint (or "don't know" fallback) was used instead. Broader than just
   *  literal "I don't know": ANY unconfirmed range counts, per the respondent's own
   *  choice to leave the actual-number field blank. */
  assumptions: string[];
  /** Role → the selected option's label text, for roles in `assumptions` — lets the
   *  UI show exactly which range was averaged ("assumed — average of 30–60"). */
  assumedRangeLabel: Partial<Record<ClinicRole, string>>;
  /** Rate roles whose value fell below RATE_PLAUSIBILITY_FLOOR — almost always a
   *  unit mix-up. Drives the "these numbers don't add up" gate on the result. */
  suspectRoles: ClinicRole[];
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

/** Resolve a raw number to its working value using the question's declared unit,
 *  falling back to the role's default when the question doesn't declare one. */
function toWorking(role: ClinicRole, value: number, unit?: ClinicUnit | null): number {
  return toWorkingValue(value, isClinicUnit(unit) ? unit : defaultUnitForRole(role));
}

/**
 * Reduce the selected answers to normalized numeric inputs. Later answers for a
 * role win (there should be one each, except UPLIFT_BOOKRATE which sums). Missing
 * inputs default to 0 — the overrides/guards in computeResult handle that safely.
 */
export function deriveInputs(answers: RawAnswer[], config: EngineConfig): ClinicInputs {
  const base: Partial<Record<ClinicRole, number>> = {};
  const assumptions: string[] = [];
  const assumedRangeLabel: Partial<Record<ClinicRole, string>> = {};
  const suspectRoles: ClinicRole[] = [];
  const weakest: WeakArea[] = [];
  let bookUpliftPoints = 0;

  for (const a of answers) {
    if (!isClinicRole(a.role)) continue;

    if (a.role === "UPLIFT_BOOKRATE") {
      // Behavioral, not a number a respondent would know — no actual-value override.
      const working = toWorking(a.role, a.value, a.unit);
      bookUpliftPoints += working;
      if (a.clause && working > 0) {
        weakest.push({ key: a.role, clause: a.clause, severity: working });
      }
      continue;
    }

    // The respondent's own exact number wins when given; otherwise fall back to the
    // selected option's range midpoint (or "don't know" default) — and flag it, since
    // ANY unconfirmed range should read as an assumption, not just literal "I don't know".
    const hasActual = a.actualValue != null && Number.isFinite(a.actualValue);
    const working = toWorking(a.role, hasActual ? (a.actualValue as number) : a.value, a.unit);
    base[a.role] = working;
    if (!hasActual) {
      assumptions.push(ROLE_LABEL[a.role]);
      if (a.optionLabel) assumedRangeLabel[a.role] = a.optionLabel;
    }
    // A rate below its plausibility floor is almost certainly a unit mix-up — flag
    // it rather than let it silently produce a 10x-wrong revenue figure.
    const floor = RATE_PLAUSIBILITY_FLOOR[a.role];
    if (floor !== undefined && working > 0 && working < floor) suspectRoles.push(a.role);

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
    assumedRangeLabel,
    suspectRoles,
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
  assumedRangeLabel: Partial<Record<ClinicRole, string>>;
  /** Exact (unrounded) monthly cases — lets callers judge coherence without
   *  re-deriving the chain. Below 1 the funnel doesn't describe a real clinic. */
  casesNowExact: number;
  /** Rate roles whose value is implausibly low (see RATE_PLAUSIBILITY_FLOOR). */
  suspectRoles: ClinicRole[];
  /**
   * The inputs don't describe a viable clinic: fewer than one case a month, or a
   * rate below its plausibility floor. Callers must NOT present money figures from
   * this result to a respondent — ask them to correct their answers instead.
   */
  dataInconsistent: boolean;
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Compute the full result from normalized inputs. Pure — safe on the client.
 *
 * IMPORTANT: `inputs` is frequently a snapshot PERSISTED BY AN OLDER BUILD
 * (Submission.resultSnapshot.clinic.inputs), so any field added to ClinicInputs
 * after a submission was scored arrives as `undefined` here. Every collection is
 * therefore read defensively — a missing one must degrade, never throw, or every
 * historical result page and PDF 500s the moment a new field ships.
 */
export function computeResult(inputs: ClinicInputs, config: EngineConfig): ClinicAuditResult {
  const { E, B, S, C, V, D, K } = inputs;
  const weakest = inputs.weakest ?? [];
  const assumptions = inputs.assumptions ?? [];
  const assumedRangeLabel = inputs.assumedRangeLabel ?? {};
  const suspectRoles = inputs.suspectRoles ?? [];

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

  // Overrides first, then band on gap. Low-enquiries steps aside when the implied
  // ANNUAL gap is large enough — a real prospect can still have few enquiries if
  // each one is worth a lot. Low-ticket has no such override (see config comment).
  const enquiriesTooLow = E < config.minEnquiries;
  const ticketTooLow = V < config.minTicket;
  const gapOverridesLowEnquiries =
    enquiriesTooLow && !ticketTooLow && gap * 12 >= config.notViableAnnualGapOverride;
  const notViable = (enquiriesTooLow && !gapOverridesLowEnquiries) || ticketTooLow;
  const capacityBlocked = K < config.capacityBlockedBelow;

  // Plausibility is judged HERE, from the final rates, rather than trusted from
  // `inputs` — so it works identically for a snapshot written by an older build
  // (which carries no suspectRoles) as for a freshly scored one.
  const suspectFromRates: ClinicRole[] = [];
  const checkRate = (role: ClinicRole, v: number) => {
    const floor = RATE_PLAUSIBILITY_FLOOR[role];
    if (floor !== undefined && v > 0 && v < floor) suspectFromRates.push(role);
  };
  checkRate("BOOK_RATE", B);
  checkRate("SHOWUP_RATE", S);
  checkRate("CLOSE_RATE", C);
  const allSuspect = Array.from(new Set([...suspectRoles, ...suspectFromRates]));

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
    weakestAreas: weakest.slice(0, 2).map((w) => ({ key: w.key, clause: w.clause })),
    assumptions,
    assumedRangeLabel,
    casesNowExact,
    suspectRoles: allSuspect,
    // Under one case a month isn't a clinic that pays rent — it's broken input.
    dataInconsistent: allSuspect.length > 0 || (E > 0 && casesNowExact < 1),
  };
}

/** Convenience: raw answers → result in one call (server initial render). */
export function scoreClinicAudit(answers: RawAnswer[], config: EngineConfig): ClinicAuditResult {
  return computeResult(deriveInputs(answers, config), config);
}

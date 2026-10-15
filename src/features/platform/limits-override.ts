/**
 * The per-tenant limits override, as a FORM and as JSON.
 *
 * `Subscription.limitOverrides` is how a negotiated deal is expressed: Enterprise is
 * published as "from $599" precisely because the real numbers live here rather than in a
 * second catalog. Until now setting one meant editing the database by hand, which is a
 * thing nobody does at 11pm for a customer on the phone.
 *
 * This module is the pure half - no prisma, no server-only - because the ACTION needs it
 * to validate and the CLIENT needs it to render, and a second copy of "what does blank
 * mean" in the component is how the two drift apart.
 *
 * 🔴 AN OVERRIDE REPLACES, IT DOES NOT ADD. `applyOverrides` takes the override's value
 * whole (see src/lib/billing/plans.ts), so typing 5 into Ad accounts means FIVE, not five
 * more. That is right for a negotiated deal and wrong for a purchased add-on, which is
 * why overage needs its own additive counter rather than this field. The editor states
 * the resolved number back for exactly this reason.
 */
import {
  FEATURES,
  applyOverrides,
  planLimitsOverrideSchema,
  type Feature,
  type PlanLimits,
  type PlanLimitsOverride,
} from "@/lib/billing/plans";

/** What one feature flag is doing: following the plan, or forced either way. */
export type FeatureChoice = "inherit" | "on" | "off";

/**
 * The form's shape. Every limit is a STRING because that is what an input holds, and
 * because the three states a limit can be in - follow the plan, a number, unlimited -
 * do not fit in a number field.
 *
 *   ""           follow the plan (no override for this field)
 *   "unlimited"  no ceiling (only where the plan allows it, see `nullable` below)
 *   "2500"       that number
 */
export interface LimitsDraft {
  responsesPerMonth: string;
  maxAssessments: string;
  seats: string;
  adAccounts: string;
  agencyTenants: string;
  features: Record<Feature, FeatureChoice>;
}

export interface LimitFieldSpec {
  key: LimitKey;
  label: string;
  /** May this limit be "unlimited" (null)? Seats and the two counts may not. */
  nullable: boolean;
  min: number;
  hint: string;
}

export type LimitKey = "responsesPerMonth" | "maxAssessments" | "seats" | "adAccounts" | "agencyTenants";

/**
 * The five numeric limits, in the order the editor shows them: volume first, because
 * that is what a negotiation is almost always about.
 */
export const LIMIT_FIELDS: readonly LimitFieldSpec[] = [
  {
    key: "responsesPerMonth",
    label: "Responses / month",
    nullable: true,
    min: 0,
    hint: "Soft cap. Over it, answers are still captured and the result is withheld.",
  },
  {
    key: "maxAssessments",
    label: "Scorecards",
    nullable: true,
    min: 0,
    hint: "Hard cap, checked when one is created.",
  },
  {
    key: "seats",
    label: "Seats (users)",
    nullable: false,
    min: 1,
    hint: "Logins inside this workspace. A seat has never meant a workspace.",
  },
  {
    key: "adAccounts",
    label: "Ad accounts",
    nullable: false,
    min: 0,
    hint: "Replaces the plan's number. It does not add to it.",
  },
  {
    key: "agencyTenants",
    label: "Client workspaces",
    nullable: false,
    min: 0,
    hint: "How many workspaces this one may resell. 0 on every tier that does not.",
  },
];

/** A limit as a person reads it. */
export function formatLimit(v: number | null): string {
  return v === null ? "Unlimited" : v.toLocaleString("en-US");
}

const noFeatureChoices = (): Record<Feature, FeatureChoice> =>
  Object.fromEntries(FEATURES.map((f) => [f, "inherit" as FeatureChoice])) as Record<Feature, FeatureChoice>;

/** A draft that overrides nothing. */
export function emptyDraft(): LimitsDraft {
  return {
    responsesPerMonth: "",
    maxAssessments: "",
    seats: "",
    adAccounts: "",
    agencyTenants: "",
    features: noFeatureChoices(),
  };
}

/**
 * The stored JSON, back as a form. A column that fails to parse reads as "nothing
 * overridden" rather than throwing - the same posture parseLimitsSnapshot takes, and the
 * operator sees an empty form they can correct instead of a broken panel.
 */
export function draftFromOverride(raw: unknown): LimitsDraft {
  const draft = emptyDraft();
  if (raw == null) return draft;
  const parsed = planLimitsOverrideSchema.safeParse(raw);
  if (!parsed.success) return draft;
  const o = parsed.data;

  for (const field of LIMIT_FIELDS) {
    const v = o[field.key];
    if (v === undefined) continue;
    draft[field.key] = v === null ? "unlimited" : String(v);
  }
  for (const [flag, on] of Object.entries(o.features ?? {})) {
    if (typeof on === "boolean") draft.features[flag as Feature] = on ? "on" : "off";
  }
  return draft;
}

export type DraftParse =
  | { ok: true; value: PlanLimitsOverride | null }
  | { ok: false; error: string };

/**
 * The form, back as JSON to store. Returns `null` when nothing is overridden, which the
 * action writes as SQL NULL - an empty object would be an override of nothing that still
 * reads as "this tenant has a deal".
 */
export function draftToOverride(draft: LimitsDraft): DraftParse {
  const out: Record<string, unknown> = {};

  for (const field of LIMIT_FIELDS) {
    const raw = draft[field.key].trim();
    if (!raw) continue;

    if (/^unlimited$/i.test(raw)) {
      if (!field.nullable) {
        return { ok: false, error: `${field.label} cannot be unlimited. Give it a number.` };
      }
      out[field.key] = null;
      continue;
    }

    if (!/^\d+$/.test(raw)) {
      return {
        ok: false,
        error: `${field.label}: type a whole number${field.nullable ? ` or the word "unlimited"` : ""}, not "${raw}".`,
      };
    }
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < field.min) {
      return { ok: false, error: `${field.label} must be ${field.min} or more.` };
    }
    out[field.key] = n;
  }

  const features: Record<string, boolean> = {};
  for (const flag of FEATURES) {
    const choice = draft.features[flag];
    if (choice === "on") features[flag] = true;
    if (choice === "off") features[flag] = false;
  }
  if (Object.keys(features).length > 0) out.features = features;

  if (Object.keys(out).length === 0) return { ok: true, value: null };

  // Validated by the SAME schema resolution reads it with, so nothing can be stored that
  // applyOverrides would later reject and silently ignore.
  const parsed = planLimitsOverrideSchema.safeParse(out);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That combination is not a valid override." };
  }
  return { ok: true, value: parsed.data };
}

/**
 * What this override actually CHANGES, line by line, against the limits it sits on top
 * of. The editor's confirmation says this rather than "saved", so an override that
 * happens to restate the plan's own number reads as what it is: nothing.
 */
export function summariseOverride(base: PlanLimits, override: PlanLimitsOverride | null): string[] {
  if (override === null) return [];
  const resolved = applyOverrides(base, override);
  const lines: string[] = [];

  for (const field of LIMIT_FIELDS) {
    if (override[field.key] === undefined) continue;
    const from = base[field.key];
    const to = resolved[field.key];
    if (from === to) continue;
    lines.push(`${field.label} ${formatLimit(from)} → ${formatLimit(to)}`);
  }

  const flipped = FEATURES.filter((f) => base.features[f] !== resolved.features[f]);
  for (const f of flipped) lines.push(`${f} ${resolved.features[f] ? "on" : "off"}`);

  return lines;
}

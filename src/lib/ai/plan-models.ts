import { z } from "zod";
import { PLAN_IDS, type PlanId } from "@/lib/billing/plans";

/**
 * Which model a tenant's AI statements are generated with.
 *
 * The tenant writes the instructions; the platform owns the key and therefore the
 * bill, so the platform picks the model. Per plan, as DATA the owner edits in admin,
 * because a constant in the source is a constant nobody can change at 2am when a
 * model's price moves.
 *
 * Pure (no prisma, no server-only) so the admin form, the resolver and any check can
 * all read the same shape.
 */

/**
 * The code fallback when nothing is configured.
 *
 * Haiku, deliberately. At roughly 2,500 input and 400 output tokens per statement it
 * costs about half a cent, which is 5.7% of Signal's price at a full month's cap and
 * 11.3% of Agency's. Anything larger turns the AI from a feature into a margin problem,
 * and no respondent has ever asked for a longer one.
 */
export const DEFAULT_TENANT_AI_MODEL = "claude-haiku-4-5";

export const planModelsSchema = z.record(z.enum(PLAN_IDS), z.string().max(120)).default({});
export type PlanModels = Partial<Record<PlanId, string>>;

/** Parse the stored JSON. NEVER throws: a corrupt value degrades to "use the default"
 *  rather than taking down statement generation for every tenant at once. */
export function parsePlanModels(raw: unknown): PlanModels {
  const parsed = planModelsSchema.safeParse(raw);
  return parsed.success ? (parsed.data as PlanModels) : {};
}

/**
 * The model for one tenant, most specific first:
 *   1. the per-tenant override (the owner's decision about this account),
 *   2. the binding for its plan,
 *   3. the code default.
 *
 * A trial resolves as whatever plan the trial grants, because a trial is Signal.
 */
export function modelForTenant(opts: {
  override: string | null | undefined;
  plan: PlanId | null;
  planModels: PlanModels;
}): string {
  const override = opts.override?.trim();
  if (override) return override;
  const byPlan = opts.plan ? opts.planModels[opts.plan]?.trim() : undefined;
  if (byPlan) return byPlan;
  return DEFAULT_TENANT_AI_MODEL;
}

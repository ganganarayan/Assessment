import { type Plan, type SubscriptionStatus } from "@prisma/client";
import { PLAN_LIMITS, type PlanId } from "@/lib/billing/plans";

/**
 * The two PURE plan rules, split out of plan-resolve.ts - which imports prisma.
 *
 * 🔴 THIS SPLIT IS LOAD-BEARING, AND THE FAILURE IT PREVENTS IS INVISIBLE TO EVERY GATE.
 *
 * The platform console is a CLIENT component and needs these two rules to show what a
 * tenant is actually entitled to. Importing them from plan-resolve dragged
 * `@/lib/db/prisma` into the browser bundle with them, and Prisma throws "PrismaClient
 * is unable to run in this browser environment" while the module is still being
 * evaluated - so /platform rendered the error boundary and nothing on the page worked.
 * Typecheck, eslint and the Railway build all passed: the code is perfectly valid, and
 * only a browser can tell you it is wrong.
 *
 * It was latent for days. Webpack had been shaking the prisma module back out, and
 * stopped doing so when a fourth client component was added to the same page.
 *
 * So anything a CLIENT component needs lives here, with no database import anywhere in
 * its graph. plan-resolve re-exports both, so every server caller is unchanged, and
 * scripts/verify-client-bundle.ts fails if a client component ever reaches prisma again.
 */

/**
 * The plan a subscription actually ENTITLES to, given its status. A canceled/halted
 * subscription (lapsed) or a still-pending one (never paid) falls back to FREE;
 * PAST_DUE keeps the plan (dunning grace). Pure, centralized so Phase 4 reuses it.
 */
export function entitledPlan(plan: Plan, status: SubscriptionStatus): PlanId | null {
  // null = PARKED. There is no free tier to fall back to any more, and silently
  // downgrading a lapsed customer to the cheapest paid plan would be worse than parking:
  // their scorecards would keep collecting on a plan they never chose, and the first
  // sign would be a bill or a feature that stopped working with no explanation.
  if (status === "CANCELED" || status === "HALTED" || status === "PENDING") return null;
  return plan as PlanId;
}

/**
 * The plan a manual grant entitles to right now, or null when there is no live grant.
 *
 * Pure, and exported so the platform console and verify:billing read the same rule the
 * resolver does. A date in the past is not a grant; neither is a date with no paid plan
 * behind it.
 */
export function grantedPlan(plan: Plan, planExpiresAt: Date | null, now: Date = new Date()): PlanId | null {
  if (!planExpiresAt || planExpiresAt.getTime() <= now.getTime()) return null;
  const id = plan as PlanId;
  return PLAN_LIMITS[id] ? id : null;
}

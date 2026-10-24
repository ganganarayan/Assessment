/**
 * Shapes the lifecycle review screen reads.
 *
 * 🔴 A PLAIN MODULE, and it has to stay one. The actions live in lifecycle.ts, which
 * carries "use server", and a "use server" file may export nothing but async
 * functions. A type exported from there typechecks locally and fails the Railway
 * build, which is the worst possible place to find out.
 */

export interface LifecyclePlanRow {
  id: string;
  workspace: string;
  trialDay: number;
  stage: string;
  verdict: string;
  status: string;
  decidedBy: string;
  reason: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  waTemplate: string | null;
  waVars: string[];
  dueAt: string;
  dryRun: boolean;
  /** The handful of facts worth showing beside the draft, already phrased. */
  why: string[];
}

export interface LifecycleSummary {
  active: number;
  needsInput: number;
  plannedToday: number;
  byModel: number;
  tokens: number;
}

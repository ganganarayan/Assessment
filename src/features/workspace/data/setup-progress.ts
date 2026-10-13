import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveMetaConfig } from "@/lib/settings/config";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * HOW FAR THIS WORKSPACE ACTUALLY IS, derived entirely from its own data.
 *
 * The dashboard already carries the owner-authored getting-started steps, and they are
 * prose: a numbered list of sentences, identical on every workspace, with no state. A
 * tenant who did three of them on Monday reads the same five on Wednesday and has to
 * remember where they were. That missing state is the whole gap in self-onboarding.
 *
 * 🔴 DERIVED, NEVER TICKED. The obvious build is a checklist with checkboxes and a
 * stored "done" flag per step, and it is the wrong one twice over. A stored tick is a
 * claim the product cannot verify, so a workspace can look finished with no pixel and no
 * published funnel - and the authored steps are free text, so a tick would have to be
 * keyed to a sentence that the owner can reword or reorder at any time, silently moving
 * everyone's progress to a different step. Every line below is instead a fact the app can
 * check right now: either the pixel resolves or it does not.
 *
 * It therefore needs no migration, no change to how steps are authored, and cannot ever
 * be wrong in the direction that matters - telling somebody they are set up when their
 * funnel is reporting to nobody.
 */

export interface SetupStep {
  key: "adAccount" | "scorecard" | "published" | "leads";
  label: string;
  /** What to do, when it is not done yet. */
  todo: string;
  done: boolean;
  href: string;
  /** The link text. Reads as the action, not as the destination. */
  cta: string;
}

export interface SetupProgress {
  steps: SetupStep[];
  doneCount: number;
  /** True when there is nothing left to do - the panel then disappears entirely. */
  complete: boolean;
}

/**
 * Resolve the four facts. Null for the platform or an internal tenant: neither is being
 * onboarded, and a setup panel on the owner's own console is noise.
 */
export async function getSetupProgress(tenantId: string | null): Promise<SetupProgress | null> {
  if (!isBusinessTenant(tenantId)) return null;

  const [meta, assessments, published, leads] = await Promise.all([
    // The same accessor the funnel uses, so this cannot disagree with what actually
    // fires. Both halves are required: a pixel with no token sends no server-side
    // events, and that is the half nobody notices is missing.
    resolveMetaConfig(tenantId),
    prisma.assessment.count({ where: { tenantId } }),
    prisma.assessment.count({ where: { tenantId, status: "PUBLISHED" } }),
    prisma.submission.count({ where: { tenantId, status: "COMPLETED" } }),
  ]);

  const steps: SetupStep[] = [
    {
      key: "adAccount",
      label: "Connect your ad account",
      todo:
        "Add your Meta pixel ID and Conversions API token. Until both are saved your funnel collects leads and tells your ad account nothing, which looks exactly like a funnel that is not working.",
      done: !!(meta.pixelId && meta.capiToken),
      href: "/w/ad-accounts",
      cta: "Add the pixel",
    },
    {
      key: "scorecard",
      label: "Build a scorecard",
      todo: "Start from a template and edit it, or write your own. The template is a working funnel, not a blank page.",
      done: assessments > 0,
      href: "/w/assessments/new",
      cta: "Build one",
    },
    {
      key: "published",
      label: "Publish it",
      todo: "A draft has no public link. Publishing is what gives you the URL to put in an ad or an email.",
      done: published > 0,
      href: "/w/assessments",
      cta: "Publish",
    },
    {
      key: "leads",
      label: "Get your first qualified lead",
      todo: "Send your own traffic through it once, end to end. The first real completion is what proves the gate, the scoring and the Meta event all agree.",
      done: leads > 0,
      href: "/w/submissions",
      cta: "See submissions",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, complete: doneCount === steps.length };
}

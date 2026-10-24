import { prisma } from "@/lib/db/prisma";
import { isFeatureReleased } from "@/lib/features/release";
import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { buildFacts } from "@/lib/lifecycle/facts";
import { route } from "@/lib/lifecycle/router";
import { decide } from "@/lib/lifecycle/decide";
import { lifecycleStage } from "@/lib/lifecycle/stages";
import { type LifecycleVerdict, type Prisma } from "@prisma/client";

/**
 * THE PLANNER - one pass, once a morning, writing one plan per trialling workspace.
 *
 * It does not send. That is the entire shape of the thing: planning is a daily batch
 * that can be slow, expensive and clever, and sending is a cheap sweep that runs on
 * the app's own heartbeat and is allowed to be stupid. Keeping them apart is what
 * lets the 06:00 job exist at all without turning into a 06:00 blast.
 *
 * 🔴 DRY RUN IS HARD-WIRED ON IN PHASE 1, because there is no sender yet. Every row
 * this writes is a draft for the owner to read. Phase 2 adds the worker and the
 * platform setting that turns this off, and until then a plan row cannot reach
 * anybody however it is reached.
 */

/** 🔴 Phase 2 replaces this with a platform setting. Until then, nothing sends. */
const DRY_RUN = true;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface PlanSummary {
  considered: number;
  planned: number;
  skipped: number;
  escalated: number;
  routed: number;
  byModel: number;
  closed: number;
  failed: number;
  heldBack: boolean;
}

/** The IST calendar day as YYYY-MM-DD. The idempotency key for one night's run. */
export function istDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The hour of the IST day, 0 to 23. What the heartbeat asks before planning.
 *
 * From the fixed offset above, never from the host clock: the server runs UTC and a
 * planner that trusted the host would fire at 11:30 IST and call it morning.
 */
export function istHour(at: Date = new Date()): number {
  return new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();
}

/**
 * When today's message is due: the person's OWN anchor time of day, today.
 *
 * If that moment has already gone by the time the planner runs (somebody who signed
 * up at 03:00 and a job that runs at 06:00), it is due now rather than tomorrow.
 * Pushing it a day would quietly stretch their 14 day sequence to 15.
 */
export function dueAtFor(anchorAt: Date, now: Date): Date {
  const anchorIst = new Date(anchorAt.getTime() + IST_OFFSET_MS);
  const nowIst = new Date(now.getTime() + IST_OFFSET_MS);
  const dueIst = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate(),
    anchorIst.getUTCHours(),
    anchorIst.getUTCMinutes(),
    0,
    0,
  );
  const due = new Date(dueIst - IST_OFFSET_MS);
  return due.getTime() < now.getTime() ? now : due;
}

/**
 * Make sure every workspace that should be in the sequence has a profile, and every
 * profile that should have left it has left.
 *
 * Enrolment is deliberately narrow: a real customer workspace, inside its trial, not
 * one of the owner's own. Internal and platform workspaces are excluded because the
 * engine would otherwise spend a fortnight telling the owner to finish their trial.
 */
async function reconcileProfiles(now: Date): Promise<number> {
  let closed = 0;

  const trialling = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      unlimited: false,
      id: { not: PLATFORM_TENANT_ID },
      trialEndsAt: { gt: now },
    },
    select: { id: true, createdAt: true },
  });

  for (const t of trialling) {
    await prisma.lifecycleProfile.upsert({
      where: { tenantId: t.id },
      // An existing profile is NEVER reopened here. Somebody who unsubscribed and is
      // still inside their trial must stay unsubscribed, and an update would undo
      // the one thing in this system that is not ours to undo.
      update: {},
      create: { tenantId: t.id, anchorAt: t.createdAt },
    });
  }

  const active = await prisma.lifecycleProfile.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      tenant: {
        select: { trialEndsAt: true, deletedAt: true, subscription: { select: { status: true } } },
      },
    },
  });

  for (const p of active) {
    const sub = p.tenant.subscription?.status;
    const ended = !p.tenant.trialEndsAt || p.tenant.trialEndsAt <= now;

    // Converting outranks everything. A paying customer must never be told their
    // trial is running out, and that is the mistake this ordering exists to prevent.
    if (sub === "ACTIVE" || sub === "PAST_DUE") {
      await prisma.lifecycleProfile.update({
        where: { id: p.id },
        data: { status: "CONVERTED", stopReason: "Subscribed." },
      });
      closed++;
    } else if (p.tenant.deletedAt) {
      await prisma.lifecycleProfile.update({
        where: { id: p.id },
        data: { status: "PARKED", stopReason: "Workspace deleted." },
      });
      closed++;
    } else if (ended) {
      await prisma.lifecycleProfile.update({
        where: { id: p.id },
        data: { status: "PARKED", stopReason: "Trial ended without a subscription." },
      });
      closed++;
    }
  }
  return closed;
}

/**
 * Plan today for everybody who is due one.
 *
 * Sequential rather than parallel, on purpose: the first AI call of the run writes
 * the prompt cache and every one after it reads it. Firing fifty at once means fifty
 * cache misses and roughly four times the input bill for the same answers.
 */
export async function planToday(now: Date = new Date()): Promise<PlanSummary> {
  const out: PlanSummary = {
    considered: 0,
    planned: 0,
    skipped: 0,
    escalated: 0,
    routed: 0,
    byModel: 0,
    closed: 0,
    failed: 0,
    heldBack: false,
  };

  // 🔴 isFeatureReleased, NOT featureAllowedFor. This engine belongs to the platform
  // scope, and the platform is exempt from every switch - asking the usual way would
  // hand back "allowed" forever and the kill switch would be decorative.
  if (!(await isFeatureReleased("lifecycle"))) {
    out.heldBack = true;
    return out;
  }

  out.closed = await reconcileProfiles(now);
  const today = istDayKey(now);

  const due = await prisma.lifecycleProfile.findMany({
    where: { status: "ACTIVE", OR: [{ lastPlannedOn: null }, { lastPlannedOn: { not: today } }] },
    select: { id: true, tenantId: true, anchorAt: true },
    orderBy: { anchorAt: "asc" },
  });

  for (const profile of due) {
    /**
     * 🔴 CLAIM THE PERSON BEFORE WORKING ON THEM, not after. Two separate things
     * depend on it now that this runs on the heartbeat rather than a once-a-day cron.
     *
     * Several replicas beat at once. Without the claim each would build the same
     * facts and pay for its own AI call on the same person, and only then would the
     * unique index throw the loser's work away. The claim is one conditional UPDATE
     * and the loser gets a count of zero.
     *
     * And a person whose planning throws stays claimed. The old code left them
     * unstamped so the next run would retry, which was fine when the next run was
     * tomorrow and is a tight retry loop against a paid API when it is thirty
     * seconds away. One attempt per person per day. Tomorrow writes a fresh one from
     * fresh facts, which is the better version of a retry anyway.
     */
    const claim = await prisma.lifecycleProfile.updateMany({
      where: { id: profile.id, OR: [{ lastPlannedOn: null }, { lastPlannedOn: { not: today } }] },
      data: { lastPlannedOn: today },
    });
    if (claim.count === 0) continue;

    out.considered++;
    try {
      const facts = await buildFacts(profile.tenantId, profile.anchorAt, now);
      if (!facts) {
        out.skipped++;
        continue;
      }

      const decision = route(facts);
      let stageKey: string | null = null;
      let verdict: LifecycleVerdict = "SKIP";
      let reason = decision.reason;
      let decidedBy = "router";
      let emailSubject: string | null = null;
      let emailBody: string | null = null;
      let waTemplate: string | null = null;
      let waVars: string[] = [];
      let model: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;

      if (decision.kind === "skip") {
        verdict = "SKIP";
        out.routed++;
      } else if (decision.kind === "decided") {
        // A routed stage still needs words, and the shortlist of one is what it gets.
        stageKey = decision.stageKey;
        const written = await decide(facts, [decision.stageKey]);
        if (written) {
          decidedBy = "ai";
          out.byModel++;
          verdict = written.action === "SEND" ? "SEND" : written.action === "SKIP" ? "SKIP" : "ESCALATE";
          reason = written.reason;
          emailSubject = written.emailSubject;
          emailBody = written.emailBody;
          waTemplate = written.waTemplate;
          waVars = written.waVars;
          model = written.model;
          inputTokens = written.inputTokens;
          outputTokens = written.outputTokens;
        } else {
          // The stage is right and only the words are missing, so this is a question
          // for a human rather than a reason to say nothing.
          verdict = "ESCALATE";
          reason = `${decision.reason} Copy could not be generated.`;
          out.routed++;
        }
      } else {
        const written = await decide(facts, decision.candidates);
        if (written) {
          decidedBy = "ai";
          out.byModel++;
          stageKey = written.stageKey;
          verdict = written.action === "SEND" ? "SEND" : written.action === "SKIP" ? "SKIP" : "ESCALATE";
          reason = written.reason;
          emailSubject = written.emailSubject;
          emailBody = written.emailBody;
          waTemplate = written.waTemplate;
          waVars = written.waVars;
          model = written.model;
          inputTokens = written.inputTokens;
          outputTokens = written.outputTokens;
        } else {
          // 🟡 The documented fallback: take the router's first candidate and park it
          // for a human. Never silently pick one and send it.
          stageKey = decision.candidates[0] ?? null;
          verdict = "ESCALATE";
          reason = `${decision.reason} The model did not answer.`;
          out.routed++;
        }
      }

      const status =
        verdict === "ESCALATE" ? "NEEDS_INPUT" : verdict === "SKIP" ? "SKIPPED" : "DRAFT";
      if (verdict === "ESCALATE") out.escalated++;
      else if (verdict === "SKIP") out.skipped++;
      else out.planned++;

      // A SKIP still gets a row. The owner asking "why did nobody hear from us on
      // Thursday" deserves an answer, and a missing row is not one.
      await prisma.lifecyclePlan.upsert({
        where: { profileId_planDate: { profileId: profile.id, planDate: today } },
        update: {},
        create: {
          profileId: profile.id,
          tenantId: profile.tenantId,
          planDate: today,
          dueAt: dueAtFor(profile.anchorAt, now),
          trialDay: facts.trialDay,
          stageKey: stageKey ?? "none",
          verdict,
          status,
          decidedBy,
          reason,
          facts: facts as unknown as Prisma.InputJsonValue,
          emailSubject,
          emailBody,
          waTemplate,
          waVars: waVars.length ? (waVars as unknown as Prisma.InputJsonValue) : undefined,
          dryRun: DRY_RUN,
          model,
          inputTokens,
          outputTokens,
        },
      });

    } catch (e) {
      out.failed++;
      console.error(
        `[lifecycle] planning failed for ${profile.tenantId}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return out;
}

/** Stage labels for the review screen, resolved once rather than per row. */
export function stageLabel(key: string): string {
  return lifecycleStage(key)?.label ?? key;
}

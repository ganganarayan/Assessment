"use server";

import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { startDrip, stopDrip, isDripRunning } from "@/lib/crm/drip";
import { sendDiagnosisUpdate } from "@/lib/crm/send";
import { buildEnvelope, shapePayload } from "@/lib/events/payload";
import { type ActionResult } from "@/features/assessment/actions/shared";

const MAX_ATTEMPTS = 3;

export interface CrmResendStatus {
  url: string | null;
  running: boolean;
  /** Changed-but-not-yet-sent (will be sent on the next run). */
  pending: number;
  /** Successfully pushed (and not dirtied again since). */
  sent: number;
  /** Gave up after repeated failures (still dirty, needs attention). */
  failed: number;
  /** A run was active but the process restarted (deploy) — click Start to resume. */
  needsResume: boolean;
}

export async function getCrmResendStatus(): Promise<ActionResult<CrmResendStatus>> {
  await requireSuperAdmin();
  const setting = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { crmResendUrl: true, crmDripActive: true },
  });
  const [queuedPending, candidatePending, failed, sent] = await Promise.all([
    // Frozen into the active batch and still to send (what the running drip sends).
    prisma.submission.count({ where: { status: "COMPLETED", crmDirty: true, crmQueuedAt: { not: null }, crmAttempts: { lt: MAX_ATTEMPTS } } }),
    // Dirty + sendable (the set that would be frozen on the next Start).
    prisma.submission.count({ where: { status: "COMPLETED", crmDirty: true, crmAttempts: { lt: MAX_ATTEMPTS } } }),
    prisma.submission.count({ where: { status: "COMPLETED", crmDirty: true, crmAttempts: { gte: MAX_ATTEMPTS } } }),
    prisma.submission.count({ where: { status: "COMPLETED", crmDirty: false, crmSentAt: { not: null } } }),
  ]);
  const running = isDripRunning();
  // While a batch is active, show what it will actually send; otherwise show the
  // candidates that the next Start will freeze. Keeps "pending" honest vs the drip.
  const pending = queuedPending > 0 ? queuedPending : candidatePending;
  return {
    ok: true,
    data: {
      url: setting?.crmResendUrl ?? null,
      running,
      pending,
      sent,
      failed,
      // A frozen batch remains but this process isn't running it (deploy/restart);
      // it auto-resumes on boot, but surface a hint in case the admin is watching.
      needsResume: !!setting?.crmDripActive && !running && queuedPending > 0,
    },
  };
}

export async function setCrmResendUrl(url: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const u = (url ?? "").trim();
  if (u && !/^https?:\/\//i.test(u)) return { ok: false, error: "Enter a valid http(s) URL." };
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { crmResendUrl: u || null },
    create: { id: "singleton", crmResendUrl: u || null },
  });
  return { ok: true };
}

export async function startCrmResend(): Promise<ActionResult> {
  await requireSuperAdmin();
  const setting = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { crmResendUrl: true },
  });
  if (!setting?.crmResendUrl) return { ok: false, error: "Set the CRM endpoint URL first." };

  // Freeze the batch: if nothing is already queued, snapshot the contacts pending
  // RIGHT NOW into this run (set crmQueuedAt). The drip only sends queued rows, so
  // exactly today's pending set is sent, never contacts dirtied later, and never
  // the already-sent ones (crmDirty is false on those). If a batch is already
  // queued (e.g. resuming after a deploy), leave it as-is and just continue.
  const alreadyQueued = await prisma.submission.count({
    where: { status: "COMPLETED", crmDirty: true, crmQueuedAt: { not: null }, crmAttempts: { lt: MAX_ATTEMPTS } },
  });
  if (alreadyQueued === 0) {
    await prisma.submission.updateMany({
      where: { status: "COMPLETED", crmDirty: true, crmAttempts: { lt: MAX_ATTEMPTS } },
      data: { crmQueuedAt: new Date() },
    });
  }

  await startDrip();
  return { ok: true };
}

export async function stopCrmResend(): Promise<ActionResult> {
  await requireSuperAdmin();
  stopDrip();
  return { ok: true };
}

/**
 * One-off TEST send to the configured CRM endpoint, using the exact same
 * score_updated payload shape as the real drip but with the values you type in.
 * Lets you confirm the endpoint + field mapping before the full run.
 */
export async function sendTestCrm(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
}): Promise<ActionResult<{ status: number; body: string }>> {
  await requireSuperAdmin();
  const setting = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { crmResendUrl: true },
  });
  const url = setting?.crmResendUrl?.trim();
  if (!url) return { ok: false, error: "Set the CRM endpoint URL first." };

  const envelope = buildEnvelope(
    EventType.ASSESSMENT_COMPLETED,
    {
      submissionId: "test_send",
      customerId: "TESTSEND",
      assessment: {
        id: "test",
        slug: "executive-emotional-stability-assessment",
        title: "Executive Emotional Stability Assessment",
      },
      lead: {
        firstName: input.name?.trim() || null,
        lastName: null,
        email: input.email?.trim() || null,
        mobile: input.phone?.trim() || null,
        profession: "Test",
      },
      score: { total: 46, max: 60, percentage: 77 },
      resultBand: { level: "CRITICAL", title: "Critical" },
      categories: null,
      aiStatement: input.message?.trim() || null,
    },
    env.NEXT_PUBLIC_APP_URL,
  );
  const payload = shapePayload(EventType.ASSESSMENT_COMPLETED, envelope);
  payload["contact.event_type"] = "score_updated";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.text()).slice(0, 500);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body}` };
    return { ok: true, data: { status: res.status, body } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ----------------------------------------- diagnosis backfill (all contacts) --- */

/** How many per round the client-driven diagnosis backfill sends. */
const DIAGNOSIS_BATCH = 2;
const diagnosisWhere = (assessmentId: string) => ({
  assessmentId,
  status: "COMPLETED" as const,
  leadEmail: { not: null },
});

export interface DiagnosisBatchResult {
  total: number;
  scanned: number;
  succeeded: number;
  failed: number;
  skipped: number;
  done: boolean;
  nextOffset: number;
}

/** Count of completed contacts with an email (the diagnosis-backfill target set). */
export async function diagnosisBackfillCount(assessmentId: string): Promise<ActionResult<{ total: number }>> {
  await requireSuperAdmin();
  const total = await prisma.submission.count({ where: diagnosisWhere(assessmentId) });
  return { ok: true, data: { total } };
}

/**
 * Send the diagnosis (overall band word) for ALL completed contacts of this
 * assessment to the CRM, one round at a time (client-driven). Each send is a
 * minimal {email + contact.assessment_diagnosis} payload tagged
 * contact.event_type=diagnosis_update. Ordered oldest-first; the client repeats
 * with nextOffset until done.
 */
export async function diagnosisBackfillBatch(
  assessmentId: string,
  offset: number,
): Promise<ActionResult<DiagnosisBatchResult>> {
  await requireSuperAdmin();
  const total = await prisma.submission.count({ where: diagnosisWhere(assessmentId) });
  const subs = await prisma.submission.findMany({
    where: diagnosisWhere(assessmentId),
    orderBy: { createdAt: "asc" },
    skip: Math.max(0, offset),
    take: DIAGNOSIS_BATCH,
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendDiagnosisUpdate(s.id);
      if (r.ok) succeeded += 1;
      else if (r.skipped) skipped += 1;
      else failed += 1;
    }),
  );

  const nextOffset = offset + subs.length;
  return {
    ok: true,
    data: { total, scanned: subs.length, succeeded, failed, skipped, done: subs.length === 0 || nextOffset >= total, nextOffset },
  };
}

/** Reset failed rows and RE-QUEUE them (the drip cleared crmQueuedAt when they
 *  exhausted retries), so a running batch picks them up again, or the next Start
 *  includes them. */
export async function retryFailedCrmResend(): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.submission.updateMany({
    where: { status: "COMPLETED", crmDirty: true, crmAttempts: { gte: MAX_ATTEMPTS } },
    data: { crmAttempts: 0, crmLastError: null, crmQueuedAt: new Date() },
  });
  return { ok: true };
}

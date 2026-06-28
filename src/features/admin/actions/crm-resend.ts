"use server";

import { EventType, CrmSendKind, CrmSendStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { startWorker, stopWorker, isWorkerRunning } from "@/lib/crm/drip";
import { enqueueScore, enqueueCustom, countCustomTargets, type CustomScope } from "@/lib/crm/enqueue";
import { buildEnvelope, shapePayload } from "@/lib/events/payload";
import { buildCustomPayload, isCustomFieldKey, type CustomFieldData } from "@/lib/crm/custom-fields";
import { type ActionResult } from "@/features/assessment/actions/shared";

const MAX_ATTEMPTS = 3;
const TEST_TIMEOUT = 15_000;

/* --------------------------------------------------- shared counts + pending --- */

async function kindCounts(kind: CrmSendKind): Promise<{ pending: number; sent: number; failed: number }> {
  const [pending, sending, sent, failed] = await Promise.all([
    prisma.crmSendQueue.count({ where: { kind, status: "PENDING", attempts: { lt: MAX_ATTEMPTS } } }),
    prisma.crmSendQueue.count({ where: { kind, status: "SENDING" } }),
    prisma.crmSendQueue.count({ where: { kind, status: "SENT" } }),
    prisma.crmSendQueue.count({ where: { kind, status: "FAILED" } }),
  ]);
  return { pending: pending + sending, sent, failed };
}

export interface CrmPendingRow {
  id: string;
  kind: CrmSendKind;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  queuedAt: string;
}
export interface CrmPending {
  count: number;
  rows: CrmPendingRow[];
}

async function listPending(kind: CrmSendKind): Promise<CrmPending> {
  const where = { kind, status: { in: [CrmSendStatus.PENDING, CrmSendStatus.SENDING] } };
  const [count, rows] = await Promise.all([
    prisma.crmSendQueue.count({ where }),
    prisma.crmSendQueue.findMany({
      where,
      orderBy: { queuedAt: "asc" },
      take: 500,
      select: { id: true, kind: true, contactName: true, contactEmail: true, contactPhone: true, queuedAt: true },
    }),
  ]);
  return { count, rows: rows.map((r) => ({ ...r, queuedAt: r.queuedAt.toISOString() })) };
}

function validSchedule(startHour: number, endHour: number, delayMin: number, delayMax: number): string | null {
  for (const [label, v] of [["Start", startHour], ["End", endHour]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 23) return `${label} hour must be a whole number 0-23.`;
  }
  if (!Number.isInteger(delayMin) || delayMin < 1) return "Min delay must be at least 1 minute.";
  if (!Number.isInteger(delayMax) || delayMax < delayMin) return "Max delay must be ≥ min delay.";
  return null;
}

/* ------------------------------------------------------------------ SCORE send --- */

export interface ScoreStatus {
  url: string | null;
  running: boolean;
  pending: number;
  sent: number;
  failed: number;
  needsResume: boolean;
  startHour: number;
  endHour: number;
  delayMin: number;
  delayMax: number;
}

export async function getScoreStatus(): Promise<ActionResult<ScoreStatus>> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      crmResendUrl: true,
      crmDripActive: true,
      crmScoreStartHour: true,
      crmScoreEndHour: true,
      crmScoreDelayMin: true,
      crmScoreDelayMax: true,
    },
  });
  const c = await kindCounts(CrmSendKind.SCORE);
  const running = isWorkerRunning(CrmSendKind.SCORE);
  return {
    ok: true,
    data: {
      url: s?.crmResendUrl ?? null,
      running,
      pending: c.pending,
      sent: c.sent,
      failed: c.failed,
      needsResume: !!s?.crmDripActive && !running && c.pending > 0,
      startHour: s?.crmScoreStartHour ?? 9,
      endHour: s?.crmScoreEndHour ?? 21,
      delayMin: s?.crmScoreDelayMin ?? 10,
      delayMax: s?.crmScoreDelayMax ?? 12,
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

export async function setScoreSchedule(input: {
  startHour: number;
  endHour: number;
  delayMin: number;
  delayMax: number;
}): Promise<ActionResult> {
  await requireSuperAdmin();
  const err = validSchedule(input.startHour, input.endHour, input.delayMin, input.delayMax);
  if (err) return { ok: false, error: err };
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { crmScoreStartHour: input.startHour, crmScoreEndHour: input.endHour, crmScoreDelayMin: input.delayMin, crmScoreDelayMax: input.delayMax },
    create: { id: "singleton", crmScoreStartHour: input.startHour, crmScoreEndHour: input.endHour, crmScoreDelayMin: input.delayMin, crmScoreDelayMax: input.delayMax },
  });
  return { ok: true };
}

export async function startScore(): Promise<ActionResult<{ enqueued: number }>> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { crmResendUrl: true } });
  if (!s?.crmResendUrl) return { ok: false, error: "Set the score endpoint URL first." };
  const enqueued = await enqueueScore();
  await startWorker(CrmSendKind.SCORE);
  return { ok: true, data: { enqueued } };
}

export async function stopScore(): Promise<ActionResult> {
  await requireSuperAdmin();
  await stopWorker(CrmSendKind.SCORE);
  return { ok: true };
}

export async function retryFailedScore(): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.crmSendQueue.updateMany({
    where: { kind: CrmSendKind.SCORE, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, lastError: null },
  });
  return { ok: true };
}

export async function listScorePending(): Promise<ActionResult<CrmPending>> {
  await requireSuperAdmin();
  return { ok: true, data: await listPending(CrmSendKind.SCORE) };
}

/**
 * One-off TEST score send to the configured endpoint, using the exact
 * score_updated payload shape with the values you type.
 */
export async function sendTestCrm(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
}): Promise<ActionResult<{ status: number; body: string }>> {
  await requireSuperAdmin();
  const setting = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { crmResendUrl: true } });
  const url = setting?.crmResendUrl?.trim();
  if (!url) return { ok: false, error: "Set the score endpoint URL first." };

  const envelope = buildEnvelope(
    EventType.ASSESSMENT_COMPLETED,
    {
      submissionId: "test_send",
      customerId: "TESTSEND",
      assessment: { id: "test", slug: "executive-emotional-stability-assessment", title: "Executive Emotional Stability Assessment" },
      lead: { firstName: input.name?.trim() || null, lastName: null, email: input.email?.trim() || null, mobile: input.phone?.trim() || null, profession: "Test" },
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
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(TEST_TIMEOUT) });
    const body = (await res.text()).slice(0, 500);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body}` };
    return { ok: true, data: { status: res.status, body } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ----------------------------------------------------------------- CUSTOM send --- */

export interface CustomConfig {
  url: string | null;
  name: string;
  eventType: string;
  fields: string[];
  startHour: number;
  endHour: number;
  delayMin: number;
  delayMax: number;
  running: boolean;
  pending: number;
  sent: number;
  failed: number;
  needsResume: boolean;
}

export async function getCustomConfig(): Promise<ActionResult<CustomConfig>> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      crmDiagnosisUrl: true,
      crmCustomName: true,
      crmCustomEventType: true,
      crmCustomFields: true,
      crmCustomStartHour: true,
      crmCustomEndHour: true,
      crmCustomDelayMin: true,
      crmCustomDelayMax: true,
      crmCustomActive: true,
    },
  });
  const c = await kindCounts(CrmSendKind.CUSTOM);
  const running = isWorkerRunning(CrmSendKind.CUSTOM);
  return {
    ok: true,
    data: {
      url: s?.crmDiagnosisUrl ?? null,
      name: s?.crmCustomName ?? "Diagnosis",
      eventType: s?.crmCustomEventType ?? "diagnosis_update",
      fields: s?.crmCustomFields ?? [],
      startHour: s?.crmCustomStartHour ?? 9,
      endHour: s?.crmCustomEndHour ?? 21,
      delayMin: s?.crmCustomDelayMin ?? 10,
      delayMax: s?.crmCustomDelayMax ?? 12,
      running,
      pending: c.pending,
      sent: c.sent,
      failed: c.failed,
      needsResume: !!s?.crmCustomActive && !running && c.pending > 0,
    },
  };
}

export async function setCrmDiagnosisUrl(url: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const u = (url ?? "").trim();
  if (u && !/^https?:\/\//i.test(u)) return { ok: false, error: "Enter a valid http(s) URL." };
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { crmDiagnosisUrl: u || null },
    create: { id: "singleton", crmDiagnosisUrl: u || null },
  });
  return { ok: true };
}

export async function setCustomConfig(input: {
  name: string;
  eventType: string;
  fields: string[];
  startHour: number;
  endHour: number;
  delayMin: number;
  delayMax: number;
}): Promise<ActionResult> {
  await requireSuperAdmin();
  const err = validSchedule(input.startHour, input.endHour, input.delayMin, input.delayMax);
  if (err) return { ok: false, error: err };
  const name = input.name?.trim() || "Diagnosis";
  const eventType = input.eventType?.trim() || "diagnosis_update";
  const fields = (input.fields ?? []).filter(isCustomFieldKey);
  const data = { crmCustomName: name, crmCustomEventType: eventType, crmCustomFields: fields, crmCustomStartHour: input.startHour, crmCustomEndHour: input.endHour, crmCustomDelayMin: input.delayMin, crmCustomDelayMax: input.delayMax };
  await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  return { ok: true };
}

export async function startCustom(
  assessmentId: string,
  scope: CustomScope = "all",
): Promise<ActionResult<{ enqueued: number }>> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { crmDiagnosisUrl: true } });
  if (!s?.crmDiagnosisUrl) return { ok: false, error: "Set the endpoint URL first." };
  const enqueued = await enqueueCustom(assessmentId, scope);
  await startWorker(CrmSendKind.CUSTOM);
  return { ok: true, data: { enqueued } };
}

/** Count how many contacts the given scope would queue — preview before sending. */
export async function previewCustomCount(
  assessmentId: string,
  scope: CustomScope = "all",
): Promise<ActionResult<{ count: number }>> {
  await requireSuperAdmin();
  return { ok: true, data: { count: await countCustomTargets(assessmentId, scope) } };
}

export async function stopCustom(): Promise<ActionResult> {
  await requireSuperAdmin();
  await stopWorker(CrmSendKind.CUSTOM);
  return { ok: true };
}

export async function retryFailedCustom(): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.crmSendQueue.updateMany({
    where: { kind: CrmSendKind.CUSTOM, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, lastError: null },
  });
  return { ok: true };
}

export async function listCustomPending(): Promise<ActionResult<CrmPending>> {
  await requireSuperAdmin();
  return { ok: true, data: await listPending(CrmSendKind.CUSTOM) };
}

/**
 * TEST custom send: builds the payload from the SAVED config (selected fields +
 * event_type) with the test contact you type and sample values for data fields.
 */
export async function sendTestCustom(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<ActionResult<{ status: number; body: string }>> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { crmDiagnosisUrl: true, crmCustomEventType: true, crmCustomFields: true },
  });
  const url = s?.crmDiagnosisUrl?.trim();
  if (!s || !url) return { ok: false, error: "Set the endpoint URL first." };

  const data: CustomFieldData = {
    name: input.name?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    diagnosis: "Critical",
    scorePercent: 77,
    bandLevel: "CRITICAL",
    scoreRaw: 46,
    scoreMax: 60,
    customerId: "TESTSEND",
    resultUrl: `${env.NEXT_PUBLIC_APP_URL}/a/test/r/test_send`,
    aiStatement: "Test statement.",
    profession: "Test",
  };
  const payload = buildCustomPayload(s.crmCustomFields, s.crmCustomEventType, data);

  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(TEST_TIMEOUT) });
    const body = (await res.text()).slice(0, 500);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body}` };
    return { ok: true, data: { status: res.status, body } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

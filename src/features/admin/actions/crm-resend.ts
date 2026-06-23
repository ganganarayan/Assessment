"use server";

import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { startDrip, stopDrip, isDripRunning } from "@/lib/crm/drip";
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
  const [pending, failed, sent] = await Promise.all([
    prisma.submission.count({ where: { crmDirty: true, crmAttempts: { lt: MAX_ATTEMPTS } } }),
    prisma.submission.count({ where: { crmDirty: true, crmAttempts: { gte: MAX_ATTEMPTS } } }),
    prisma.submission.count({ where: { crmDirty: false, crmSentAt: { not: null } } }),
  ]);
  const running = isDripRunning();
  return {
    ok: true,
    data: {
      url: setting?.crmResendUrl ?? null,
      running,
      pending,
      sent,
      failed,
      // Persisted intent says active, but this process isn't running it (restart) and
      // there's still work left -> the admin should click Start to resume.
      needsResume: !!setting?.crmDripActive && !running && pending > 0,
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
  await startDrip();
  return { ok: true };
}

export async function stopCrmResend(): Promise<ActionResult> {
  await requireSuperAdmin();
  stopDrip();
  return { ok: true };
}

/** Reset the retry counter on failed rows so the next run attempts them again. */
export async function retryFailedCrmResend(): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.submission.updateMany({
    where: { crmDirty: true, crmAttempts: { gte: MAX_ATTEMPTS } },
    data: { crmAttempts: 0, crmLastError: null },
  });
  return { ok: true };
}

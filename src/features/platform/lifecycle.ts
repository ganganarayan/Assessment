"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { formatIST } from "@/lib/date";
import { stageLabel, planToday } from "@/lib/lifecycle/plan";
import { type LifecycleFacts } from "@/lib/lifecycle/facts";
import { type LifecyclePlanRow, type LifecycleSummary } from "@/features/platform/lifecycle-types";

/**
 * The review queue - what the engine decided, and the owner's say over it.
 *
 * 🔴 THIS IS THE "EMAIL ME WHEN YOU ARE UNSURE" LOOP, built as a screen rather than
 * as a reply-to address. The owner asked for an email they could answer; parsing a
 * free-text reply back onto the right row is the kind of plumbing that works for a
 * month and then silently drops somebody's answer. A list with the facts, the draft
 * and two buttons costs the same thirty seconds and cannot lose an instruction.
 *
 * Super admin only. These are the platform's own trial signups, and no tenant has any
 * business reading another workspace's behaviour.
 */

function whyFrom(facts: unknown): string[] {
  const f = facts as Partial<LifecycleFacts> | null;
  if (!f) return [];
  const out: string[] = [];
  if (f.logins) {
    out.push(
      f.logins.count === 0
        ? "Never signed in"
        : `${f.logins.count} sign-ins, last ${f.logins.lastOn ?? "unknown"}`,
    );
  }
  if (f.onboarding) out.push(`Onboarding ${f.onboarding.answered}/${f.onboarding.total}`);
  if (f.funnels) out.push(`${f.funnels.total} funnels, ${f.funnels.published} published`);
  if (f.responses) out.push(`${f.responses.total} responses (${f.responses.recent} recent)`);
  if (f.call?.booked) out.push(`Call ${String(f.call.status).toLowerCase()}`);
  if (typeof f.daysLeft === "number") out.push(`${f.daysLeft} days left`);
  return out;
}

function asVars(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * The queue: anything waiting on the owner first, then everything else planned
 * recently. Capped, because this screen is a work list and not an archive.
 */
export async function listLifecyclePlans(): Promise<LifecyclePlanRow[]> {
  await requireSuperAdmin();
  const rows = await prisma.lifecyclePlan.findMany({
    where: { status: { in: ["NEEDS_INPUT", "DRAFT", "APPROVED", "SKIPPED"] } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 100,
    select: {
      id: true,
      tenantId: true,
      trialDay: true,
      stageKey: true,
      verdict: true,
      status: true,
      decidedBy: true,
      reason: true,
      emailSubject: true,
      emailBody: true,
      waTemplate: true,
      waVars: true,
      dueAt: true,
      dryRun: true,
      facts: true,
    },
  });

  const names = await prisma.tenant.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    id: r.id,
    workspace: nameOf.get(r.tenantId) ?? r.tenantId,
    trialDay: r.trialDay,
    stage: stageLabel(r.stageKey),
    verdict: r.verdict,
    status: r.status,
    decidedBy: r.decidedBy,
    reason: r.reason,
    emailSubject: r.emailSubject,
    emailBody: r.emailBody,
    waTemplate: r.waTemplate,
    waVars: asVars(r.waVars),
    dueAt: formatIST(r.dueAt),
    dryRun: r.dryRun,
    why: whyFrom(r.facts),
  }));
}

/** What the run cost and covered, for the header strip. */
export async function lifecycleSummary(): Promise<LifecycleSummary> {
  await requireSuperAdmin();
  const [active, needsInput, recent] = await Promise.all([
    prisma.lifecycleProfile.count({ where: { status: "ACTIVE" } }),
    prisma.lifecyclePlan.count({ where: { status: "NEEDS_INPUT" } }),
    prisma.lifecyclePlan.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      select: { decidedBy: true, inputTokens: true, outputTokens: true },
    }),
  ]);
  return {
    active,
    needsInput,
    plannedToday: recent.length,
    byModel: recent.filter((r) => r.decidedBy === "ai").length,
    tokens: recent.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0),
  };
}

/**
 * Approve one plan, with whatever the owner edited into it.
 *
 * 🟡 Approving does NOT send in Phase 1. There is no sender yet, and the row carries
 * dryRun. What approval buys today is the record of what the owner would have let go
 * out, which is exactly the thing the first week of this engine is for.
 */
export async function approveLifecyclePlan(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const subject = String(formData.get("emailSubject") ?? "").trim();
  const body = String(formData.get("emailBody") ?? "").trim();
  if (!id || !subject || !body) return;

  await prisma.lifecyclePlan.update({
    where: { id },
    data: { status: "APPROVED", verdict: "SEND", emailSubject: subject, emailBody: body },
  });
  revalidatePath("/admin/lifecycle");
}

/** Say no to one plan. The reason is kept: it is the training data for the catalogue. */
export async function skipLifecyclePlan(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const reason = String(formData.get("reason") ?? "").trim() || "Skipped by the owner.";
  await prisma.lifecyclePlan.update({
    where: { id },
    data: { status: "SKIPPED", verdict: "SKIP", reason: reason.slice(0, 300) },
  });
  revalidatePath("/admin/lifecycle");
}

/**
 * Run the planner now rather than waiting for 06:00.
 *
 * Safe to press twice: a profile already planned for today is skipped by the day key,
 * so this cannot produce a second message for anybody.
 */
export async function runLifecyclePlannerNow(): Promise<void> {
  await requireSuperAdmin();
  const s = await planToday();
  console.info(
    `[lifecycle] manual run: considered ${s.considered}, planned ${s.planned}, escalated ${s.escalated}`,
  );
  revalidatePath("/admin/lifecycle");
}

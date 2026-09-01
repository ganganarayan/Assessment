"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";
import { type ActionResult } from "@/features/assessment/actions/shared";

/** Stored UTC instant -> IST datetime-local value "YYYY-MM-DDTHH:mm" for the input. */
function toIstLocalInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** Parse an IST datetime-local ("YYYY-MM-DDTHH:mm") to a UTC Date; ""/null => null. */
function parseIstLocal(istLocal: string | null): Date | null | "invalid" {
  const v = (istLocal ?? "").trim();
  if (!v) return null;
  const withSeconds = v.length === 16 ? `${v}:00` : v;
  const d = new Date(`${withSeconds}+05:30`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export async function getStatsWindow(): Promise<
  ActionResult<{ startAtInput: string; startAtIso: string | null }>
> {
  // Scope to the caller: a tenant admin (or a super admin impersonating one) reads
  // that tenant's window; a super admin at the platform view reads the singleton.
  const scope = await resolveActingScope();
  const s = scope.tenantId
    ? await prisma.appSetting.findUnique({ where: { tenantId: scope.tenantId }, select: { statsResetAt: true } })
    : await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { statsResetAt: true } });
  return {
    ok: true,
    data: {
      startAtInput: toIstLocalInput(s?.statsResetAt ?? null),
      startAtIso: s?.statsResetAt?.toISOString() ?? null,
    },
  };
}

/**
 * Set (or clear) the reporting start date for the caller's scope. `istLocal` is the
 * datetime-local value in IST ("YYYY-MM-DDTHH:mm"); null/empty clears it (show all
 * data). Stored UTC. A tenant writes its OWN AppSetting row; the platform view writes
 * the singleton. View-only staff are blocked.
 */
export async function setStatsWindow(istLocal: string | null): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const parsed = parseIstLocal(istLocal);
  if (parsed === "invalid") return { ok: false, error: "Enter a valid date and time." };
  if (scope.tenantId) {
    await prisma.appSetting.upsert({
      where: { tenantId: scope.tenantId },
      update: { statsResetAt: parsed },
      create: { id: tenantAppSettingId(scope.tenantId), tenantId: scope.tenantId, statsResetAt: parsed },
    });
  } else {
    await prisma.appSetting.upsert({
      where: { id: "singleton" },
      update: { statsResetAt: parsed },
      create: { id: "singleton", statsResetAt: parsed },
    });
  }
  revalidatePath("/admin/data-window");
  revalidatePath("/w/data-window");
  return { ok: true };
}

/** Per-assessment reporting window (its own Data window). Scoped + ownership-checked. */
export async function getAssessmentStatsWindow(
  assessmentId: string,
): Promise<ActionResult<{ startAtInput: string; startAtIso: string | null }>> {
  const scope = await resolveActingScope();
  const a = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...tenantScope(scope) },
    select: { statsResetAt: true },
  });
  if (!a) return { ok: false, error: "Not found." };
  return {
    ok: true,
    data: {
      startAtInput: toIstLocalInput(a.statsResetAt ?? null),
      startAtIso: a.statsResetAt?.toISOString() ?? null,
    },
  };
}

export async function setAssessmentStatsWindow(
  assessmentId: string,
  istLocal: string | null,
): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const owned = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...tenantScope(scope) },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Not found." };
  const parsed = parseIstLocal(istLocal);
  if (parsed === "invalid") return { ok: false, error: "Enter a valid date and time." };
  await prisma.assessment.update({ where: { id: assessmentId }, data: { statsResetAt: parsed } });
  revalidatePath("/admin/data-window");
  return { ok: true };
}

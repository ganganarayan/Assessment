"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { listPromptVersions, nextVersionNumber } from "@/lib/ai/versions";
import { type ActionResult } from "@/features/assessment/actions/shared";

function bump() {
  revalidatePath("/admin/ai");
  revalidatePath("/w/settings");
}

/** Create the next empty instruction version (V3, V4, …) for the acting tenant. */
export async function createPromptVersion(): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const number = await nextVersionNumber(scope.tenantId);
  const row = await prisma.aiPromptVersion.create({
    data: { tenantId: scope.tenantId, number, label: `V${number}`, instructions: "" },
    select: { id: true },
  });
  bump();
  return { ok: true, data: { id: row.id } };
}

/** Save a version's label + instructions (built-ins are code, not editable). */
export async function updatePromptVersion(
  id: string,
  label: string,
  instructions: string,
): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const owned = await prisma.aiPromptVersion.findFirst({
    where: { id, tenantId: scope.tenantId },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Not found." };
  await prisma.aiPromptVersion.update({
    where: { id },
    data: { label: label.trim() || "Untitled", instructions: instructions.slice(0, 20000) },
  });
  bump();
  return { ok: true };
}

export async function deletePromptVersion(id: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const owned = await prisma.aiPromptVersion.findFirst({
    where: { id, tenantId: scope.tenantId },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Not found." };
  // A deleted default/selection falls back to the code default at resolve time.
  await prisma.aiPromptVersion.delete({ where: { id } });
  bump();
  return { ok: true };
}

/** Set the tenant-wide DEFAULT version (new assessments inherit it). */
export async function setDefaultPromptVersion(id: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const rows = await listPromptVersions(scope.tenantId);
  if (!rows.some((r) => r.id === id)) return { ok: false, error: "Not found." };
  const data = { aiPromptVersion: id };
  if (scope.tenantId) {
    await prisma.appSetting.upsert({ where: { tenantId: scope.tenantId }, update: data, create: { tenantId: scope.tenantId, ...data } });
  } else {
    await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  }
  bump();
  return { ok: true };
}

/** Tenant-wide word-count window the assembled prompts ask the model for. */
export async function updateWordWindow(min: number, max: number): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper && !scope.tenantId) return { ok: false, error: "No workspace." };
  const lo = Math.max(20, Math.min(1000, Math.round(min || 0)));
  const hi = Math.max(lo, Math.min(1000, Math.round(max || 0)));
  const data = { aiWordMin: lo, aiWordMax: hi };
  if (scope.tenantId) {
    await prisma.appSetting.upsert({ where: { tenantId: scope.tenantId }, update: data, create: { tenantId: scope.tenantId, ...data } });
  } else {
    await prisma.appSetting.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  }
  bump();
  return { ok: true };
}

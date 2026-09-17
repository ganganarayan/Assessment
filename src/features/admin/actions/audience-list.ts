"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { tenantAppSettingId } from "@/lib/settings/tenant-row";
import { audienceCanonicalSchema } from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { Prisma } from "@prisma/client";

/**
 * The tenant's canonical audience list ("your default list of roles") + the tools to
 * clean up free-typed audience values against it. Everything follows the acting scope
 * (resolveActingScope), so the super-admin global view edits the platform singleton and
 * impersonating a tenant edits that tenant — the same as Ads & payments settings.
 */

/** The AppSetting row id for a scope: the platform singleton, or the tenant's row. */
function settingRowId(tenantId: string | null): string {
  return tenantId ? tenantAppSettingId(tenantId) : "singleton";
}

async function readCanonical(tenantId: string | null): Promise<string[]> {
  const where = tenantId ? { tenantId } : { id: "singleton" };
  const s = await prisma.appSetting.findUnique({ where, select: { audienceCanonical: true } });
  const raw = s?.audienceCanonical;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

/** Read the current canonical list for the acting scope. */
export async function getAudienceCanonical(): Promise<string[]> {
  const scope = await resolveActingScope();
  return readCanonical(scope.tenantId);
}

/** Save the canonical list. Accepts the raw textarea (one label per line); trims,
 *  drops blanks, de-dupes case-insensitively (first spelling wins) and caps the count. */
export async function updateAudienceCanonical(text: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const seen = new Set<string>();
  const list: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const v = line.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(v);
  }
  const parsed = audienceCanonicalSchema.safeParse(list);
  if (!parsed.success) return { ok: false, error: "Keep each entry under 120 characters and the list under 200 items." };

  const id = settingRowId(scope.tenantId);
  const data = { audienceCanonical: parsed.data as unknown as Prisma.InputJsonValue };
  await prisma.appSetting.upsert({
    where: scope.tenantId ? { tenantId: scope.tenantId } : { id: "singleton" },
    update: data,
    create: { id, tenantId: scope.tenantId, ...data },
  });
  revalidatePath("/admin/audiences");
  revalidatePath("/admin/settings");
  return { ok: true };
}

export interface AudienceUsageRow {
  value: string;
  count: number;
  /** Whether this exact value is already in the canonical list. */
  canonical: boolean;
}

/** Every distinct audience value stored on this scope's submissions, with counts and
 *  a flag for whether it matches the canonical list — the input to the normalize UI. */
export async function getAudienceUsage(): Promise<{ rows: AudienceUsageRow[]; canonical: string[] }> {
  const scope = await resolveActingScope();
  const canonical = await readCanonical(scope.tenantId);
  const canonSet = new Set(canonical.map((c) => c.toLowerCase()));

  const grouped = await prisma.submission.groupBy({
    by: ["audienceRole"],
    where: { ...tenantScope(scope), audienceRole: { not: null } },
    _count: { audienceRole: true },
    orderBy: { _count: { audienceRole: "desc" } },
  });

  const rows: AudienceUsageRow[] = grouped
    .map((g) => ({
      value: (g.audienceRole ?? "").trim(),
      count: g._count.audienceRole,
      canonical: canonSet.has((g.audienceRole ?? "").trim().toLowerCase()),
    }))
    .filter((r) => r.value.length > 0);
  return { rows, canonical };
}

/**
 * Rename one stored audience value to another across every matching submission on this
 * scope (the "fix a typo / map to a canonical role" action, and the building block for
 * merging variants: rename each variant to the same target). Mirrors the change into
 * leadProfession on the rows where it was mirrored (gated funnels feed the CRM from it).
 */
export async function renameAudienceValue(from: string, to: string): Promise<ActionResult<{ updated: number }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const src = from.trim();
  const dst = to.trim().slice(0, 120);
  if (!src) return { ok: false, error: "Nothing to rename." };
  if (!dst) return { ok: false, error: "Enter a value to rename to." };
  if (src === dst) return { ok: true, data: { updated: 0 } };

  const scoped = tenantScope(scope);
  // Keep the CRM mirror consistent: update leadProfession first on the rows where it
  // matched the old value (gated free-text submissions mirror the role into it), then
  // move the audienceRole itself.
  await prisma.submission.updateMany({
    where: { ...scoped, audienceRole: src, leadProfession: src },
    data: { leadProfession: dst },
  });
  const res = await prisma.submission.updateMany({
    where: { ...scoped, audienceRole: src },
    data: { audienceRole: dst },
  });

  revalidatePath("/admin/audiences");
  return { ok: true, data: { updated: res.count } };
}

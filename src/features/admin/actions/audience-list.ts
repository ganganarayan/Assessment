"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, configTenantOf, type ActingScope } from "@/lib/tenant/acting";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { audienceCanonicalSchema, audienceListNameSchema } from "@/features/assessment/schemas";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { Prisma } from "@prisma/client";

/**
 * NAMED audience lists ("Clinic roles", "Coaches", …) and the tools to clean up
 * free-typed audience values against them.
 *
 * Everything here is CONFIG, so it is owned and addressed by configTenantOf: the
 * super-admin global view edits the Platform tenant's lists and an entered workspace
 * edits that workspace's - the same choice AI keys and prompt versions make. There is
 * no cross-tenant list, by design; a list is read in the builder of the funnel it
 * feeds.
 */

/** Rows a picker needs: the name, how many labels it holds, and which is the default. */
export interface AudienceListRow {
  id: string;
  name: string;
  items: string[];
  isDefault: boolean;
}

/** Normalize whatever is in the JSON column into trimmed, non-empty labels. */
function readItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

async function rowsFor(tenantId: string): Promise<AudienceListRow[]> {
  const lists = await prisma.audienceList.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, items: true, isDefault: true },
  });
  return lists.map((l) => ({ id: l.id, name: l.name, items: readItems(l.items), isDefault: l.isDefault }));
}

/** Every named list in the acting scope, default first. */
export async function getAudienceLists(): Promise<AudienceListRow[]> {
  const scope = await resolveActingScope();
  return rowsFor(configTenantOf(scope));
}

/**
 * The same thing for a KNOWN tenant, for server components that already resolved one
 * (the builder pages pass it to the gate's list picker). Not an authorization
 * boundary - the caller has already established the scope.
 */
export async function getAudienceListsForTenant(tenantId: string): Promise<AudienceListRow[]> {
  return rowsFor(tenantId);
}

/** Parse + clean a textarea of labels (one per line): trim, drop blanks, de-dupe
 *  case-insensitively with the first spelling winning, and cap the count. */
function parseItems(text: string): { ok: true; items: string[] } | { ok: false; error: string } {
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
  if (!parsed.success) {
    return { ok: false, error: "Keep each entry under 120 characters and the list under 200 items." };
  }
  return { ok: true, items: parsed.data };
}

function revalidateAudiences() {
  revalidatePath("/admin/audiences");
  revalidatePath("/w/audiences");
  revalidatePath("/admin/settings");
}

/** Resolve the acting scope for a mutation, or the view-only refusal. */
async function editableScope(): Promise<{ scope: ActingScope; tenantId: string } | { ok: false; error: string }> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  return { scope, tenantId: configTenantOf(scope) };
}

/** Create a named list. The FIRST list a tenant has becomes its default, so a
 *  workspace is never in the state of having lists but no fallback. */
export async function createAudienceList(name: string, text = ""): Promise<ActionResult<{ id: string }>> {
  const got = await editableScope();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const parsedName = audienceListNameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0]?.message ?? "Invalid name." };
  const items = parseItems(text);
  if (!items.ok) return items;

  const count = await prisma.audienceList.count({ where: { tenantId } });
  try {
    const created = await prisma.audienceList.create({
      data: {
        tenantId,
        name: parsedName.data,
        items: items.items as unknown as Prisma.InputJsonValue,
        isDefault: count === 0,
      },
      select: { id: true },
    });
    revalidateAudiences();
    return { ok: true, data: { id: created.id } };
  } catch {
    // The only constraint a person can hit here is the per-tenant name.
    return { ok: false, error: "You already have a list with that name." };
  }
}

/** Save one list's labels (the textarea), and optionally rename it at the same time. */
export async function updateAudienceList(id: string, text: string, name?: string): Promise<ActionResult> {
  const got = await editableScope();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const existing = await prisma.audienceList.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existing) return { ok: false, error: "That list isn't in this workspace." };

  const items = parseItems(text);
  if (!items.ok) return items;

  const data: Prisma.AudienceListUpdateInput = { items: items.items as unknown as Prisma.InputJsonValue };
  if (name !== undefined) {
    const parsedName = audienceListNameSchema.safeParse(name);
    if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0]?.message ?? "Invalid name." };
    data.name = parsedName.data;
  }

  try {
    await prisma.audienceList.update({ where: { id }, data });
  } catch {
    return { ok: false, error: "You already have a list with that name." };
  }
  revalidateAudiences();
  return { ok: true };
}

/** Make one list the fallback for gates that name none. Exactly one default per tenant
 *  is a database constraint, so the old one is cleared in the same transaction. */
export async function setDefaultAudienceList(id: string): Promise<ActionResult> {
  const got = await editableScope();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const target = await prisma.audienceList.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!target) return { ok: false, error: "That list isn't in this workspace." };

  await prisma.$transaction([
    prisma.audienceList.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } }),
    prisma.audienceList.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidateAudiences();
  return { ok: true };
}

/** Which assessments in this tenant point their gate at a given list. Read in JS
 *  rather than as a JSON path query: the row count is a workspace's assessments, and
 *  the gate shape is deliberately schemaless. */
async function assessmentsUsing(tenantId: string, listId: string): Promise<string[]> {
  const rows = await prisma.assessment.findMany({
    where: { tenantId },
    select: { title: true, audienceGate: true },
  });
  return rows
    .filter((r) => {
      const g = r.audienceGate as { listId?: unknown } | null;
      return !!g && typeof g.listId === "string" && g.listId === listId;
    })
    .map((r) => r.title);
}

/**
 * Delete a list. Refused while an assessment names it, and refused for the last
 * remaining list: in both cases the alternative is a funnel whose suggestions silently
 * empty out, which nobody would connect back to this screen.
 */
export async function deleteAudienceList(id: string): Promise<ActionResult> {
  const got = await editableScope();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const target = await prisma.audienceList.findFirst({ where: { id, tenantId }, select: { id: true, isDefault: true } });
  if (!target) return { ok: false, error: "That list isn't in this workspace." };

  const inUse = await assessmentsUsing(tenantId, id);
  if (inUse.length > 0) {
    const shown = inUse.slice(0, 3).join(", ");
    const more = inUse.length > 3 ? ` and ${inUse.length - 3} more` : "";
    return { ok: false, error: `Still used by ${shown}${more}. Point those at another list first.` };
  }

  await prisma.audienceList.delete({ where: { id } });

  // Losing the default leaves gates that name no list with nothing to fall back on,
  // so the oldest remaining list takes over rather than the workspace going quiet.
  if (target.isDefault) {
    const next = await prisma.audienceList.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (next) await prisma.audienceList.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  revalidateAudiences();
  return { ok: true };
}

export interface AudienceUsageRow {
  value: string;
  count: number;
  /** Whether this exact value appears in ANY of the scope's lists. */
  canonical: boolean;
}

/** Every distinct audience value stored on this scope's submissions, with counts and
 *  a flag for whether it matches a label in any list - the input to the normalize UI. */
export async function getAudienceUsage(): Promise<{ rows: AudienceUsageRow[]; canonical: string[] }> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const lists = await rowsFor(tenantId);

  // One pooled vocabulary for the check and the rename suggestions: a submission
  // carries the value typed, not the list it came from, so "known somewhere in this
  // workspace" is the only question the stored data can actually answer.
  const canonSet = new Set<string>();
  const canonical: string[] = [];
  for (const l of lists) {
    for (const v of l.items) {
      const key = v.toLowerCase();
      if (canonSet.has(key)) continue;
      canonSet.add(key);
      canonical.push(v);
    }
  }
  canonical.sort((a, b) => a.localeCompare(b));

  const grouped = await prisma.submission.groupBy({
    by: ["audienceRole"],
    where: { tenantId, audienceRole: { not: null } },
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
  const got = await editableScope();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const src = from.trim();
  const dst = to.trim().slice(0, 120);
  if (!src) return { ok: false, error: "Nothing to rename." };
  if (!dst) return { ok: false, error: "Enter a value to rename to." };
  if (src === dst) return { ok: true, data: { updated: 0 } };

  // Keep the CRM mirror consistent: update leadProfession first on the rows where it
  // matched the old value (gated free-text submissions mirror the role into it), then
  // move the audienceRole itself.
  await prisma.submission.updateMany({
    where: { tenantId, audienceRole: src, leadProfession: src },
    data: { leadProfession: dst },
  });
  const res = await prisma.submission.updateMany({
    where: { tenantId, audienceRole: src },
    data: { audienceRole: dst },
  });

  revalidateAudiences();
  return { ok: true, data: { updated: res.count } };
}

/**
 * LEGACY. The single pre-named-lists list, still read by nothing but kept callable for
 * one release so a deploy that lands mid-session does not 500 on a stale client bundle.
 * Returns the default list's labels, which is what the old call meant.
 */
export async function getAudienceCanonical(): Promise<string[]> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const lists = await rowsFor(tenantId);
  const def = lists.find((l) => l.isDefault) ?? lists[0];
  if (def) return def.items;
  const s = await prisma.appSetting.findUnique({
    where: appSettingWhere(scope.tenantId),
    select: { audienceCanonical: true },
  });
  return readItems(s?.audienceCanonical);
}

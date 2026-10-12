"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { resolveActingScope, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { assertCanCreateAdAccount } from "@/lib/billing/gate";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PARKED_MESSAGE } from "@/lib/billing/plans";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * AD ACCOUNTS - the Meta configurations a workspace runs its funnels against.
 *
 * The model and the resolver landed first (see AdAccount in the schema and
 * resolveMetaConfig); this is the screen above them. Until it existed a tenant had the
 * TABLE but no way to see or name a row, so "2 ad accounts" and "10 ad accounts" were
 * claims about a feature with no surface.
 *
 * 🔴 THE PLATFORM HAS NO AD ACCOUNTS HERE. Its own pixel lives in platformPixelId /
 * platformCapiTokenEnc on the settings singleton and is read by a different path
 * (resolvePlatformMetaConfig). Letting the super-admin global view create rows on the
 * Platform tenant would produce exactly what this phase set out to delete: records that
 * look live and are read by nothing. So every mutation here refuses at platform scope
 * and says where that pixel actually lives.
 *
 * Secrets never round-trip: the CAPI token is encrypted at rest and the UI only ever
 * learns whether one is saved.
 */

/** One ad account, as the manager screen and the builder's picker need it. */
export interface AdAccountRow {
  id: string;
  label: string;
  pixelId: string;
  /** True when a CAPI token is stored. The token itself is never returned. */
  hasCapiToken: boolean;
  isDefault: boolean;
  /** How many assessments report to it - a delete blocker, so it is shown up front. */
  assessmentCount: number;
}

/** What the screen needs to explain the tenant's position, not just list rows. */
export interface AdAccountsView {
  accounts: AdAccountRow[];
  /** The plan's ad-account allowance. */
  limit: number;
  /** True when this scope cannot own ad accounts (the platform's own view). */
  platformScope: boolean;
  /** True when the caller may edit (view-only staff get a read-only screen). */
  canEdit: boolean;
}

const LABEL_MAX = 80;
const PIXEL_MAX = 40;

function cleanLabel(raw: string): string {
  return raw.trim().slice(0, LABEL_MAX);
}

/**
 * A pixel id is digits. Validated rather than trusted because the failure is invisible:
 * a pasted id with a stray character is accepted by Meta's endpoint as an unknown
 * dataset, so events leave the app, 200 comes back, and nothing ever arrives.
 */
function cleanPixelId(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = raw.trim();
  if (!v) return { ok: true, value: null };
  if (!/^\d{6,}$/.test(v) || v.length > PIXEL_MAX) {
    return { ok: false, error: "A Meta pixel ID is digits only (at least six). Copy it from Events Manager." };
  }
  return { ok: true, value: v };
}

/** Resolve the owning tenant for a mutation, or the refusal to return instead. */
async function editableTenant(): Promise<{ tenantId: string; isSuper: boolean } | { ok: false; error: string }> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const tenantId = configTenantOf(scope);
  if (isPlatformScope(tenantId)) {
    return {
      ok: false,
      error:
        "The platform's own pixel is not an ad account - it lives in Settings under Platform pixel. Enter a workspace to manage that workspace's ad accounts.",
    };
  }
  return { tenantId, isSuper: scope.isSuper };
}

function revalidateAdAccounts() {
  revalidatePath("/admin/ad-accounts");
  revalidatePath("/w/ad-accounts");
  revalidatePath("/admin/settings");
  revalidatePath("/w/settings");
}

async function rowsFor(tenantId: string): Promise<AdAccountRow[]> {
  const [accounts, counts] = await Promise.all([
    prisma.adAccount.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      select: { id: true, label: true, pixelId: true, capiTokenEnc: true, isDefault: true },
    }),
    prisma.assessment.groupBy({
      by: ["adAccountId"],
      where: { tenantId, adAccountId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const used = new Map(counts.map((c) => [c.adAccountId, c._count._all]));
  return accounts.map((a) => ({
    id: a.id,
    label: a.label,
    pixelId: a.pixelId ?? "",
    hasCapiToken: !!a.capiTokenEnc,
    isDefault: a.isDefault,
    assessmentCount: used.get(a.id) ?? 0,
  }));
}

/** Everything the Ad accounts screen renders, for the acting scope. */
export async function getAdAccountsView(): Promise<AdAccountsView> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  if (isPlatformScope(tenantId)) {
    return { accounts: [], limit: 0, platformScope: true, canEdit: scope.canEdit };
  }
  const [accounts, plan] = await Promise.all([rowsFor(tenantId), resolvePlan(tenantId)]);
  return { accounts, limit: plan.limits.adAccounts, platformScope: false, canEdit: scope.canEdit };
}

/**
 * The picker list for a KNOWN tenant, for server components that already resolved one
 * (the builder pages). Not an authorization boundary - the caller established the scope.
 */
export async function getAdAccountsForTenant(tenantId: string): Promise<AdAccountRow[]> {
  if (isPlatformScope(tenantId)) return [];
  return rowsFor(tenantId);
}

/**
 * Add an ad account. The FIRST one a workspace has becomes its default, so there is
 * never a state with accounts configured and no fallback for assessments that name none.
 */
export async function createAdAccount(
  label: string,
  pixelId: string,
  capiToken: string,
): Promise<ActionResult<{ id: string }>> {
  const got = await editableTenant();
  if ("ok" in got) return got;
  const { tenantId, isSuper } = got;

  const name = cleanLabel(label);
  if (!name) return { ok: false, error: "Give this ad account a name you will recognise, e.g. \"Acme - AU\"." };
  const pixel = cleanPixelId(pixelId);
  if (!pixel.ok) return pixel;

  /**
   * Billing gate. Parked reads as a cap of 0, which would otherwise be reported as
   * "your plan's limit of 0 ad accounts" - true, and indistinguishable from a bug.
   *
   * The app owner operating a workspace is exempt, the same rule
   * `assertCanCreateAssessment` follows: an operator is not rated against the plan they
   * are administering, and setting up a client's account by hand is exactly the case the
   * exemption exists for. Their own escape hatch for selling an extra account before the
   * overage counter exists is this plus `limitOverrides.adAccounts`.
   */
  const cap = isSuper ? ({ ok: true } as const) : await assertCanCreateAdAccount(tenantId);
  if (!cap.ok) {
    if ((await resolvePlan(tenantId)).parked) return { ok: false, error: PARKED_MESSAGE };
    return {
      ok: false,
      error: `Your plan includes ${cap.limit} ad account${cap.limit === 1 ? "" : "s"} and you are using ${cap.used}. Upgrade to run more.`,
    };
  }

  const count = await prisma.adAccount.count({ where: { tenantId } });
  const created = await prisma.adAccount.create({
    data: {
      tenantId,
      label: name,
      pixelId: pixel.value,
      capiTokenEnc: capiToken.trim() ? encryptWithSecret(capiToken.trim(), env.BETTER_AUTH_SECRET) : null,
      isDefault: count === 0,
    },
    select: { id: true },
  });
  revalidateAdAccounts();
  return { ok: true, data: { id: created.id } };
}

/** Rename an account or change its credentials. A blank token keeps the stored one. */
export async function updateAdAccount(
  id: string,
  label: string,
  pixelId: string,
  capiToken: string,
): Promise<ActionResult> {
  const got = await editableTenant();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const existing = await prisma.adAccount.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existing) return { ok: false, error: "That ad account isn't in this workspace." };

  const name = cleanLabel(label);
  if (!name) return { ok: false, error: "Give this ad account a name you will recognise." };
  const pixel = cleanPixelId(pixelId);
  if (!pixel.ok) return pixel;

  await prisma.adAccount.update({
    where: { id },
    data: {
      label: name,
      pixelId: pixel.value,
      // Blank = keep. The plaintext is never sent to the client, so a form that
      // round-tripped an empty field would wipe a live token on every save.
      ...(capiToken.trim() ? { capiTokenEnc: encryptWithSecret(capiToken.trim(), env.BETTER_AUTH_SECRET) } : {}),
    },
  });
  revalidateAdAccounts();
  return { ok: true };
}

/** Clear the stored CAPI token for one account, without touching anything else. */
export async function clearAdAccountToken(id: string): Promise<ActionResult> {
  const got = await editableTenant();
  if ("ok" in got) return got;
  const { tenantId } = got;
  const existing = await prisma.adAccount.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existing) return { ok: false, error: "That ad account isn't in this workspace." };
  await prisma.adAccount.update({ where: { id }, data: { capiTokenEnc: null } });
  revalidateAdAccounts();
  return { ok: true };
}

/**
 * Make one account the workspace default - the one every assessment that names none
 * reports to. Exactly one default per tenant is a DATABASE constraint (a partial unique
 * index), so the old default is cleared in the same transaction rather than hoped about.
 */
export async function setDefaultAdAccount(id: string): Promise<ActionResult> {
  const got = await editableTenant();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const target = await prisma.adAccount.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!target) return { ok: false, error: "That ad account isn't in this workspace." };

  await prisma.$transaction([
    prisma.adAccount.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } }),
    prisma.adAccount.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidateAdAccounts();
  return { ok: true };
}

/**
 * Delete an ad account.
 *
 * Refused while an assessment reports to it: the foreign key is RESTRICT, so the
 * database would refuse anyway, and a caught constraint error is a worse sentence than
 * one that names the funnels to move first.
 *
 * 🔴 DELETING THE LAST ONE CLEARS THE LEGACY COLUMNS TOO. `resolveMetaConfig` reads the
 * old AppSetting pixel columns only when a tenant has NO ad-account rows, so a workspace
 * that deleted its last account would silently fall back to whatever those columns held
 * - a pixel id the tenant last saw before the migration and cannot see anywhere in the
 * UI now. Clearing them makes the fallback resolve to nothing, which is visible (the
 * publish lock fires, the log says not configured) instead of quietly correct-looking.
 */
export async function deleteAdAccount(id: string): Promise<ActionResult> {
  const got = await editableTenant();
  if ("ok" in got) return got;
  const { tenantId } = got;

  const target = await prisma.adAccount.findFirst({ where: { id, tenantId }, select: { id: true, isDefault: true } });
  if (!target) return { ok: false, error: "That ad account isn't in this workspace." };

  const inUse = await prisma.assessment.findMany({
    where: { tenantId, adAccountId: id },
    select: { title: true },
    take: 4,
  });
  if (inUse.length > 0) {
    const names = inUse.map((a) => a.title).join(", ");
    return {
      ok: false,
      error: `Still in use by ${names}. Point those funnels at another ad account first - deleting this one would leave them reporting nowhere.`,
    };
  }

  const total = await prisma.adAccount.count({ where: { tenantId } });
  if (total > 1 && target.isDefault) {
    return {
      ok: false,
      error: "This is your default ad account. Make another one the default first, so funnels that name none still have somewhere to report.",
    };
  }

  if (total === 1) {
    await prisma.$transaction([
      prisma.adAccount.delete({ where: { id } }),
      prisma.appSetting.updateMany({ where: { tenantId }, data: { metaPixelId: null, metaCapiTokenEnc: null } }),
    ]);
  } else {
    await prisma.adAccount.delete({ where: { id } });
  }
  revalidateAdAccounts();
  return { ok: true };
}

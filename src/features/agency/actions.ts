"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser, isSuperAdmin, currentUserCanEdit } from "@/lib/auth/guards";
import { formatIST } from "@/lib/date";
import { provisionWorkspace } from "@/lib/tenant/provision";
import { assertCanCreateAgencyTenant, agencyTenantUsage, type AgencyTenantUsage } from "@/lib/billing/gate";
import { resolvePlan } from "@/lib/billing/entitlements";
import { agencyTenantExtraUsd, PARKED_MESSAGE } from "@/lib/billing/plans";
import { isAgencyTenantOf } from "@/lib/tenant/agency";
import { readActingTenant, writeActingTenant, clearActingTenant } from "@/lib/tenant/acting-cookie";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * AGENCY TENANTS - the workspaces an AGENCY ADMIN runs for the people who hire them.
 *
 * Every action here resolves the caller's OWN workspace, deliberately not the acting
 * one. 🔴 requireWorkspace returns the ENTERED workspace while an agency admin is inside
 * one of their agency tenants, so using it here would make "add an agency tenant" mean
 * "add one under the client I happen to be looking at" - a second level the billing
 * model cannot express and the schema is built to refuse.
 *
 * The super admin does not manage tenants from here: /platform is their screen, it holds
 * every workspace on the install, and a second list showing a subset would be a second
 * answer to the same question.
 */

/** One agency tenant, as the screen needs it. */
export interface AgencyTenantRow {
  id: string;
  name: string;
  slug: string;
  created: string;
  /** The login handed to that client, so the agency admin can tell them who it is. */
  loginEmail: string | null;
  /** Their primary custom domain, when the agency chose to give them one. */
  domain: string | null;
  assessmentCount: number;
  submissionCount: number;
  /** Removed, slot freed, data intact. Restorable while the cap allows it. */
  removed: boolean;
}

export interface AgencyTenantsView {
  tenants: AgencyTenantRow[];
  removed: AgencyTenantRow[];
  usage: AgencyTenantUsage;
  canEdit: boolean;
  /**
   * Why the screen is read-only, when it is:
   *  - notReselling: the plan includes no agency tenants (or the workspace is parked)
   *  - nested: the caller IS an agency tenant, and depth is one
   *  - platform: the super admin, who manages workspaces on /platform
   */
  blocked: "no" | "notReselling" | "nested" | "platform";
  /** The workspace the caller is inside right now, if it is one of theirs. */
  insideId: string | null;
  /** Price of one agency tenant beyond the included count, USD / month. */
  extraPriceUsd: number;
  /**
   * Whether MORE can be bought right now. False on the trial (one, to try) and while
   * parked - in both cases the answer to "I need another" is the plan, not a slot, and
   * offering a $29 button to somebody with no subscription to attach it to would fail at
   * Razorpay with a message nobody could act on.
   */
  canBuySlots: boolean;
  /** True while the agency admin's own workspace is parked - the cause of notReselling. */
  parkedMessage: string | null;
}

const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  deletedAt: true,
  domains: { where: { verified: true }, select: { hostname: true, isPrimary: true } },
  users: { where: { deletedAt: null }, select: { email: true }, orderBy: { createdAt: "asc" as const }, take: 1 },
  _count: { select: { assessments: true, submissions: true } },
} as const;

type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  deletedAt: Date | null;
  domains: { hostname: string; isPrimary: boolean }[];
  users: { email: string }[];
  _count: { assessments: number; submissions: number };
};

function toRow(t: TenantRecord): AgencyTenantRow {
  const primary = t.domains.find((d) => d.isPrimary) ?? t.domains[0] ?? null;
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    created: formatIST(t.createdAt),
    loginEmail: t.users[0]?.email ?? null,
    domain: primary?.hostname ?? null,
    assessmentCount: t._count.assessments,
    submissionCount: t._count.submissions,
    removed: t.deletedAt != null,
  };
}

/**
 * The caller as an AGENCY ADMIN: their own workspace id, never the one they have
 * entered. Returns the reason instead when this caller cannot resell at all.
 */
async function agencyAdminScope(): Promise<
  | { ok: true; tenantId: string; canEdit: boolean }
  | { ok: false; blocked: "notReselling" | "nested" | "platform"; error: string }
> {
  const user = await requireUser();
  if (isSuperAdmin(user)) {
    return {
      ok: false,
      blocked: "platform",
      error: "Workspaces are managed on the platform console, not here. Open /platform to create one.",
    };
  }
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true, tenant: { select: { deletedAt: true, agencyAdminTenantId: true } } },
  });
  const own = fresh?.tenantId ?? null;
  if (!own || fresh?.tenant?.deletedAt) {
    return { ok: false, blocked: "notReselling", error: "You have no workspace." };
  }
  // An agency tenant may never own agency tenants. Stated here as well as in the gate so
  // the screen can explain it rather than just refuse.
  if (fresh?.tenant?.agencyAdminTenantId) {
    return {
      ok: false,
      blocked: "nested",
      error: "This workspace belongs to an agency, so it cannot have workspaces of its own.",
    };
  }
  return { ok: true, tenantId: own, canEdit: await currentUserCanEdit() };
}

export async function getAgencyTenantsView(): Promise<AgencyTenantsView> {
  const empty: AgencyTenantUsage = { included: 0, extra: 0, limit: 0, used: 0 };
  const scope = await agencyAdminScope();
  if (!scope.ok) {
    return {
      tenants: [], removed: [], usage: empty, canEdit: false,
      // No workspace resolved here, so no tier to price against: the entry price for
      // reselling. This branch shows no buy button anyway (canBuySlots is false).
      blocked: scope.blocked, insideId: null, extraPriceUsd: agencyTenantExtraUsd(null),
      parkedMessage: null, canBuySlots: false,
    };
  }

  const user = await requireUser();
  const [rows, usage, resolved, acting] = await Promise.all([
    prisma.tenant.findMany({
      where: { agencyAdminTenantId: scope.tenantId },
      orderBy: { createdAt: "asc" },
      select: TENANT_SELECT,
    }),
    agencyTenantUsage(scope.tenantId),
    resolvePlan(scope.tenantId),
    readActingTenant(user.id),
  ]);

  const mapped = rows.map(toRow);
  const inside = acting && mapped.some((r) => r.id === acting) ? acting : null;
  return {
    tenants: mapped.filter((r) => !r.removed),
    removed: mapped.filter((r) => r.removed),
    usage,
    canEdit: scope.canEdit,
    blocked: usage.limit > 0 ? "no" : "notReselling",
    insideId: inside,
    extraPriceUsd: agencyTenantExtraUsd(resolved.plan),
    parkedMessage: resolved.parked ? PARKED_MESSAGE : null,
    canBuySlots: scope.canEdit && usage.included > 0 && !resolved.parked && !resolved.trialing,
  };
}

/**
 * Create an agency tenant: a full workspace, with its own login, under this agency admin.
 *
 * No trial is stamped (see provisionWorkspace): it is entitled through its agency admin,
 * and a trial clock of its own would expire mid-contract and tell a paying agency's
 * client that their trial has run out.
 */
export async function createAgencyTenant(
  name: string,
  email: string,
  password: string,
  slug?: string,
): Promise<ActionResult<{ id: string }>> {
  const scope = await agencyAdminScope();
  if (!scope.ok) return { ok: false, error: scope.error };
  if (!scope.canEdit) return { ok: false, error: "You have view-only access - ask an admin for edit rights." };

  const gate = await assertCanCreateAgencyTenant(scope.tenantId);
  if (!gate.ok) {
    if (gate.reason === "nested") {
      return { ok: false, error: "This workspace belongs to an agency, so it cannot have workspaces of its own." };
    }
    if (gate.reason === "notReselling") {
      return {
        ok: false,
        error:
          "Your plan includes no client workspaces. The Agency plan includes five, on top of this one - see Billing.",
      };
    }
    return {
      ok: false,
      // The TIER's price, not a constant: quoting $29 to an Enterprise customer who
      // pays $25 is a wrong number in the one sentence that asks them to spend.
      error: `You are using all ${gate.limit} of your client workspaces. Remove one, or add a slot for $${agencyTenantExtraUsd((await resolvePlan(scope.tenantId)).plan)} a month in Billing.`,
    };
  }

  const done = await provisionWorkspace({
    name,
    email,
    password,
    slug,
    agencyAdminTenantId: scope.tenantId,
    trial: false,
  });
  if (!done.ok) return { ok: false, error: done.error };
  revalidatePath("/w/agency-tenants");
  return { ok: true, data: { id: done.tenantId } };
}

/**
 * Enter one of this agency admin's workspaces. The cookie is the same mechanism the
 * super admin's Enter uses, and it is re-validated against the parent link on every
 * request afterwards (src/lib/tenant/agency.ts), so writing it is not what grants access.
 */
export async function enterAgencyTenant(tenantId: string): Promise<void> {
  const scope = await agencyAdminScope();
  if (!scope.ok) redirect("/w");
  const user = await requireUser();
  if (!(await isAgencyTenantOf(tenantId, scope.tenantId))) redirect("/w/agency-tenants");
  await writeActingTenant(user.id, tenantId);
  redirect("/w");
}

/** Leave a client workspace and go back to the agency's own. */
export async function exitAgencyTenant(): Promise<void> {
  await requireUser();
  await clearActingTenant();
  redirect("/w/agency-tenants");
}

/**
 * Remove an agency tenant: soft delete, exactly as the platform console's delete does.
 * Its logins stop working and its funnels stop serving, every lead and setting is kept,
 * and the slot is free immediately.
 *
 * 🟡 The slot and the money are not the same clock, and the screen says so: removing one
 * frees the slot now, while a paid slot stops costing at the end of the billing period.
 */
export async function removeAgencyTenant(tenantId: string): Promise<ActionResult> {
  const scope = await agencyAdminScope();
  if (!scope.ok) return { ok: false, error: scope.error };
  if (!scope.canEdit) return { ok: false, error: "You have view-only access - ask an admin for edit rights." };
  if (!(await isAgencyTenantOf(tenantId, scope.tenantId))) {
    return { ok: false, error: "That workspace isn't one of yours." };
  }
  try {
    await prisma.tenant.update({ where: { id: tenantId }, data: { deletedAt: new Date() } });
  } catch (e) {
    console.error("[agency] removeAgencyTenant failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't remove that workspace (a temporary database error). Try again." };
  }
  // If the agency admin is standing inside the workspace they just removed, drop them
  // out of it: it is inert from this moment, and leaving the cookie set would show a
  // workspace that no longer serves anybody.
  const user = await requireUser();
  if ((await readActingTenant(user.id)) === tenantId) await clearActingTenant();
  revalidatePath("/w/agency-tenants");
  return { ok: true };
}

/** Put a removed agency tenant back, if there is a slot for it. */
export async function restoreAgencyTenant(tenantId: string): Promise<ActionResult> {
  const scope = await agencyAdminScope();
  if (!scope.ok) return { ok: false, error: scope.error };
  if (!scope.canEdit) return { ok: false, error: "You have view-only access - ask an admin for edit rights." };
  const row = await prisma.tenant.findFirst({
    where: { id: tenantId, agencyAdminTenantId: scope.tenantId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "That workspace isn't one of yours, or isn't removed." };
  // 🔴 The cap is checked on RESTORE as well as on create. A removed workspace freed its
  // slot, so without this an agency could remove one, fill the slot, and restore the old
  // one to end up a workspace over the limit - with nothing to bill for it.
  const gate = await assertCanCreateAgencyTenant(scope.tenantId);
  if (!gate.ok) {
    return {
      ok: false,
      error:
        gate.reason === "cap"
          ? `You are using all ${gate.limit} of your client workspaces. Remove one, or add a slot for $${agencyTenantExtraUsd((await resolvePlan(scope.tenantId)).plan)} a month, before restoring this.`
          : "Your plan includes no client workspaces right now - see Billing.",
    };
  }
  try {
    await prisma.tenant.update({ where: { id: tenantId }, data: { deletedAt: null } });
  } catch (e) {
    console.error("[agency] restoreAgencyTenant failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't restore that workspace (a temporary database error). Try again." };
  }
  revalidatePath("/w/agency-tenants");
  return { ok: true };
}

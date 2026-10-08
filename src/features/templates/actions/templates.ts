"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { istMonthStart } from "@/lib/date";
import { seedBuiltinTemplates } from "@/features/templates/seed";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type ContributionRewardView, type ReseedResult } from "@/features/templates/types";

/**
 * Super-admin actions for the Template Library.
 *
 * Every one of these is OWNER-ONLY, not merely super-admin: a template reaches every
 * workspace on the platform, so publishing one is closer to shipping a release than to
 * editing a record. VIEW/EDIT staff can look at the screen and change nothing.
 */

const OWNER_ONLY = { ok: false, error: "Only the platform owner can change the template library." } as const;

async function requireOwner(): Promise<{ ok: false; error: string } | null> {
  return isStaff(await requireSuperAdmin()) ? OWNER_ONLY : null;
}

function bump() {
  revalidatePath("/admin/templates");
  revalidatePath("/w/templates");
  revalidatePath("/w/dashboard");
}

/** Put a template on the shelf, or take it off. */
export async function setTemplatePublished(id: string, published: boolean): Promise<ActionResult> {
  const denied = await requireOwner();
  if (denied) return denied;
  const row = await prisma.template.findUnique({
    where: { id },
    select: { ownerTenantId: true, reviewStatus: true },
  });
  if (!row) return { ok: false, error: "Not found." };
  // A private template belongs to one workspace. Publishing it would hand that
  // workspace's own work to every other tenant, which nobody agreed to.
  if (row.ownerTenantId) {
    return { ok: false, error: "That template is private to a workspace. It can't be published." };
  }
  if (published && row.reviewStatus !== "APPROVED") {
    return { ok: false, error: "Approve this contribution first - publishing skips the review it is waiting for." };
  }
  await prisma.template.update({ where: { id }, data: { published } });
  bump();
  return { ok: true };
}

/** Reorder within a category. Lower sorts first. */
export async function setTemplateOrder(id: string, displayOrder: number): Promise<ActionResult> {
  const denied = await requireOwner();
  if (denied) return denied;
  const n = Math.max(0, Math.min(999, Math.round(displayOrder || 0)));
  await prisma.template.update({ where: { id }, data: { displayOrder: n } });
  bump();
  return { ok: true };
}

/** Edit the library-facing wording. The BODY is never edited here - a template's
 *  questions are changed by importing it, editing the assessment and saving it back,
 *  which is the path the tenant uses and therefore the one that stays tested. */
export async function updateTemplateMeta(
  id: string,
  input: { title: string; category: string; summary: string },
): Promise<ActionResult> {
  const denied = await requireOwner();
  if (denied) return denied;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "A title is required." };
  const category = input.category.trim();
  if (!category) return { ok: false, error: "A category is required." };
  await prisma.template.update({
    where: { id },
    data: { title: title.slice(0, 160), category: category.slice(0, 80), summary: input.summary.trim().slice(0, 500) || null },
  });
  bump();
  return { ok: true };
}

/**
 * Approve a contributed template: it becomes APPROVED and goes on the shelf.
 *
 * The CAP is one accepted contribution per workspace per calendar month, and it is a
 * WARNING rather than a wall - the owner can override it in the same click. A hard
 * limit would be wrong here: the rule exists to stop a workspace farming credit, not
 * to refuse a second genuinely good template in a month.
 *
 * The reward itself is NOT granted here. This returns what the owner needs to decide -
 * who contributed, how many they have had accepted this month, and where their credit
 * period currently ends - and the console then calls the existing plan-grant action.
 * One mechanism for extending access, not two.
 */
export async function approveTemplate(
  id: string,
  override = false,
): Promise<ActionResult<ContributionRewardView & { capExceeded: boolean }>> {
  const denied = await requireOwner();
  if (denied) return denied;

  const t = await prisma.template.findUnique({
    where: { id },
    select: {
      id: true,
      ownerTenantId: true,
      contributorTenantId: true,
      contributorName: true,
      reviewStatus: true,
    },
  });
  if (!t) return { ok: false, error: "Not found." };
  if (t.ownerTenantId) return { ok: false, error: "That template is private to a workspace, so there is nothing to approve." };

  // Count this month's accepted contributions from the same workspace, EXCLUDING this
  // row so re-approving something does not count itself twice.
  let acceptedThisMonth = 0;
  if (t.contributorTenantId) {
    acceptedThisMonth = await prisma.template.count({
      where: {
        id: { not: id },
        contributorTenantId: t.contributorTenantId,
        reviewStatus: "APPROVED",
        reviewedAt: { gte: istMonthStart() },
      },
    });
  }
  const capExceeded = acceptedThisMonth >= 1;
  if (capExceeded && !override) {
    return {
      ok: false,
      error: `This workspace has already had ${acceptedThisMonth} contribution${acceptedThisMonth === 1 ? "" : "s"} accepted this month. The reward is capped at one per calendar month - approve anyway to override it.`,
    };
  }

  await prisma.template.update({
    where: { id },
    data: { reviewStatus: "APPROVED", reviewedAt: new Date(), reviewNote: null, published: true },
  });

  const tenant = t.contributorTenantId
    ? await prisma.tenant.findUnique({
        where: { id: t.contributorTenantId },
        select: { name: true, plan: true, planExpiresAt: true },
      })
    : null;

  bump();
  return {
    ok: true,
    data: {
      contributorTenantId: t.contributorTenantId,
      contributorName: t.contributorName,
      tenantName: tenant?.name ?? null,
      acceptedThisMonth: acceptedThisMonth + 1,
      planExpiresAt: tenant?.planExpiresAt?.toISOString() ?? null,
      plan: tenant?.plan ?? null,
      capExceeded,
    },
  };
}

/** Reject a contribution, with a reason the contributor can read. Kept rather than
 *  deleted: a rejection with no record is a conversation that happens twice. */
export async function rejectTemplate(id: string, note: string): Promise<ActionResult> {
  const denied = await requireOwner();
  if (denied) return denied;
  const reason = note.trim();
  if (!reason) return { ok: false, error: "Say why - the contributor sees this." };
  await prisma.template.update({
    where: { id },
    data: { reviewStatus: "REJECTED", reviewedAt: new Date(), reviewNote: reason.slice(0, 1000), published: false },
  });
  bump();
  return { ok: true };
}

/**
 * Delete a template.
 *
 * A built-in comes BACK on the next deploy, because the repo is its source of truth.
 * Saying so in the error is the only honest answer: deleting it and watching it return
 * looks like a bug and wastes the owner's afternoon.
 */
export async function deleteTemplate(id: string): Promise<ActionResult> {
  const denied = await requireOwner();
  if (denied) return denied;
  const row = await prisma.template.findUnique({ where: { id }, select: { builtin: true } });
  if (!row) return { ok: false, error: "Not found." };
  if (row.builtin) {
    return {
      ok: false,
      error: "This is a built-in. It is seeded from the repo, so deleting it here would bring it back on the next deploy - unpublish it instead, or remove its file.",
    };
  }
  await prisma.template.delete({ where: { id } });
  bump();
  return { ok: true };
}

/** Re-read the built-in JSON files and upsert them. Never touches published or order. */
export async function reseedBuiltinTemplates(): Promise<ActionResult<ReseedResult>> {
  const denied = await requireOwner();
  if (denied) return denied;
  const r = await seedBuiltinTemplates();
  bump();
  return { ok: true, data: r };
}

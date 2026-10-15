import "server-only";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { slugSchema } from "@/features/assessment/schemas";

/**
 * PROVISION A WORKSPACE - the one place a tenant row and its login are created together.
 *
 * 🟢 WHY IT WAS EXTRACTED. The super admin creates a tenant from /platform; an agency
 * admin creates an agency tenant from /w/agency-tenants. Both need the same eight steps
 * in the same order (slug derivation, slug and email collision checks, password hashing,
 * the Better Auth credential account, the trial stamp), and the first version of the
 * second screen would have been a copy. A copy is how two screens that must agree stop
 * agreeing: the platform's version bypasses the signup auto-provision hook deliberately,
 * and a copy that forgot that would leave a stray tenant behind every create.
 *
 * It does NOT guard. The caller decides who may call it and whether a cap allows it -
 * createTenant checks the super admin, createAgencyTenant checks the plan's count - and
 * this module refuses nothing but bad input.
 */

export type ProvisionResult =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string };

export interface ProvisionInput {
  name: string;
  /** Admin login for the new workspace. */
  email: string;
  password: string;
  /** Optional explicit slug; derived from the name when absent. */
  slug?: string;
  /**
   * The agency admin's workspace this one belongs under, for an AGENCY TENANT. Null for
   * a tenant directly under the super admin.
   */
  agencyAdminTenantId?: string | null;
  /**
   * Whether to stamp the 14-day trial. TRUE for a tenant under the super admin, which
   * would otherwise be born parked and read-only from its first second.
   *
   * FALSE for an agency tenant: it is entitled through its agency admin, so a trial
   * stamp on it would be a second, unrelated clock - one that expires mid-contract and
   * tells a paying agency's client that their trial has run out.
   */
  trial: boolean;
}

export async function provisionWorkspace(input: ProvisionInput): Promise<ProvisionResult> {
  const nm = input.name.trim();
  if (nm.length < 2) return { ok: false, error: "Name is required." };
  const em = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: "Enter a valid admin email." };
  const pw = (input.password ?? "").trim();
  if (pw.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const rawSlug = input.slug && input.slug.trim()
    ? input.slug.trim().toLowerCase()
    : nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const s = slugSchema.safeParse(rawSlug);
  if (!s.success) return { ok: false, error: s.error.issues[0]?.message ?? "Invalid slug." };

  // A soft-deleted tenant still holds its slug, and saying so is the difference between
  // "that name is taken" and a name the operator can actually free.
  const clash = await prisma.tenant.findUnique({
    where: { slug: s.data },
    select: { id: true, deletedAt: true },
  });
  if (clash) {
    return {
      ok: false,
      error: clash.deletedAt
        ? `A deleted workspace still holds the slug "${s.data}". Restore it, or delete it permanently, to free the name.`
        : "That workspace slug is already in use.",
    };
  }
  if (await prisma.user.findUnique({ where: { email: em }, select: { id: true } })) {
    return { ok: false, error: "A login with that email already exists." };
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(pw);
  const trialEndsAt = input.trial ? new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000) : null;
  const t = await prisma.tenant.create({
    data: {
      slug: s.data,
      name: nm,
      trialEndsAt,
      agencyAdminTenantId: input.agencyAdminTenantId ?? null,
    },
  });
  const u = await prisma.user.create({
    data: { name: nm, email: em, role: Role.ADMIN, tenantId: t.id, emailVerified: true },
  });
  await prisma.account.create({
    data: { accountId: u.id, providerId: "credential", password: hashed, userId: u.id },
  });
  return { ok: true, tenantId: t.id, userId: u.id };
}

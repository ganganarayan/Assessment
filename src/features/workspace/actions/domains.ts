"use server";

import { promises as dns } from "dns";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  railwayConfigured,
  railwayCreateCustomDomain,
  railwayCustomDomainStatus,
  railwayDeleteCustomDomain,
  certIsLive,
} from "@/lib/railway/domains";

/**
 * Per-tenant custom domains. Every row is scoped to the acting workspace tenant
 * (requireWorkspace), so a tenant can only ever see/mutate its OWN domains — the
 * hostname column is globally unique, so one tenant claiming a host blocks it for
 * everyone.
 *
 * TLS: when RAILWAY_API_TOKEN is configured we REGISTER the host with Railway
 * (customDomainCreate) so Railway issues a real Let's Encrypt cert, and we surface
 * the exact CNAME target Railway wants (dnsTarget) + the cert status. A domain is
 * marked `verified` (→ routable by middleware/getCurrentTenant) only once its cert is
 * live. When the token is NOT set we fall back to CNAME auto-detect against this app's
 * host (cert then has to be added in Railway manually).
 */

/** The host a tenant points their CNAME at when Railway auto-provisioning is OFF. */
function appHost(): string {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL).host.toLowerCase();
  } catch {
    return env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase();
  }
}

export interface DomainView {
  id: string;
  hostname: string;
  isPrimary: boolean;
  verified: boolean;
  /** CNAME value to point DNS at (Railway target when managed, else the app host). */
  dnsTarget: string | null;
  certStatus: string | null;
  certLive: boolean;
  createdAt: string;
}

export interface DomainSettingsView {
  domains: DomainView[];
  /** Fallback CNAME target when Railway isn't managing domains. */
  cnameTarget: string;
  rootDomain: string;
  /** TRUE when Railway auto-provisioning (cert issuance) is active. */
  railwayManaged: boolean;
}

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter a valid domain.")
  .max(253, "Domain is too long.")
  .regex(
    /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
    "Enter a bare hostname like assess.yourbrand.com — no https:// or path.",
  );

export async function getDomainSettings(): Promise<DomainSettingsView> {
  const { tenantId } = await requireWorkspace();
  const managed = railwayConfigured();
  const fallback = appHost();
  const rows = await prisma.domain.findMany({
    where: { tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true, hostname: true, isPrimary: true, verified: true, dnsTarget: true, certStatus: true, createdAt: true },
  });
  return {
    domains: rows.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      isPrimary: d.isPrimary,
      verified: d.verified,
      dnsTarget: d.dnsTarget ?? (managed ? null : fallback),
      certStatus: d.certStatus,
      certLive: certIsLive(d.certStatus),
      createdAt: d.createdAt.toISOString(),
    })),
    cnameTarget: fallback,
    rootDomain: env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase(),
    railwayManaged: managed,
  };
}

export async function addDomain(rawHostname: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const parsed = hostnameSchema.safeParse(rawHostname);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid domain." };
  const hostname = parsed.data;

  const root = env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase();
  if (hostname === root || hostname.endsWith(`.${root}`)) {
    return { ok: false, error: `Subdomains of ${root} are automatic — you only need this for your OWN domain.` };
  }

  let domainId: string;
  try {
    const row = await prisma.domain.create({ data: { hostname, tenantId }, select: { id: true } });
    domainId = row.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That domain is already registered." };
    }
    throw e;
  }

  // Register with Railway so it issues the cert + tells us the CNAME target. A failure
  // here is non-fatal — the row exists and "Check status" retries the registration.
  if (railwayConfigured()) {
    try {
      const r = await railwayCreateCustomDomain(hostname);
      if (r) {
        await prisma.domain.update({
          where: { id: domainId },
          data: { railwayDomainId: r.id, dnsTarget: r.dnsTarget, certStatus: r.certStatus },
        });
      }
    } catch {
      /* keep the row; the tenant can retry from the settings screen */
    }
  }

  revalidatePath("/w/settings");
  return { ok: true };
}

/** CNAME auto-detect (fallback when Railway isn't managing): TRUE when the hostname's
 *  DNS resolves to this app. */
async function pointsToUs(hostname: string): Promise<boolean> {
  const target = appHost();
  const root = env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase();

  try {
    const cnames = await dns.resolveCname(hostname);
    if (cnames.some((c) => { const h = c.toLowerCase().replace(/\.$/, ""); return h === target || h === root || h.endsWith(`.${root}`); })) {
      return true;
    }
  } catch {
    /* no CNAME (apex/flattened) — fall through to A-record compare */
  }

  try {
    const [a, b] = await Promise.all([dns.resolve4(hostname), dns.resolve4(target)]);
    if (a.some((ip) => b.includes(ip))) return true;
  } catch {
    /* unresolved */
  }
  return false;
}

/**
 * "Check status" — with Railway managing, this (re)registers if needed, refreshes the
 * cert status, and flips `verified` once the cert is live. Without Railway it's the
 * CNAME auto-detect path.
 */
export async function verifyDomain(id: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const domain = await prisma.domain.findFirst({
    where: { id, tenantId },
    select: { id: true, hostname: true, verified: true, railwayDomainId: true },
  });
  if (!domain) return { ok: false, error: "Domain not found." };

  if (railwayConfigured()) {
    try {
      const r = domain.railwayDomainId
        ? await railwayCustomDomainStatus(domain.railwayDomainId)
        : await railwayCreateCustomDomain(domain.hostname);
      if (!r) return { ok: false, error: "Couldn't reach Railway. Try again in a moment." };
      const live = certIsLive(r.certStatus);
      await prisma.domain.update({
        where: { id: domain.id },
        data: { railwayDomainId: r.id, dnsTarget: r.dnsTarget, certStatus: r.certStatus, verified: live },
      });
      revalidatePath("/w/settings");
      return live
        ? { ok: true }
        : { ok: false, error: r.dnsTarget
            ? `Not live yet (cert: ${r.certStatus ?? "provisioning"}). Point a CNAME for ${domain.hostname} → ${r.dnsTarget}, then check again in a few minutes.`
            : `Provisioning… check again shortly.` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Railway registration failed." };
    }
  }

  // Fallback (no Railway token): CNAME auto-detect against this app's host.
  if (domain.verified) return { ok: true };
  if (!(await pointsToUs(domain.hostname))) {
    return { ok: false, error: `DNS isn't pointing here yet. Add a CNAME for ${domain.hostname} → ${appHost()} and try again in a few minutes.` };
  }
  await prisma.domain.update({ where: { id: domain.id }, data: { verified: true } });
  revalidatePath("/w/settings");
  return { ok: true };
}

export async function setPrimaryDomain(id: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const domain = await prisma.domain.findFirst({ where: { id, tenantId }, select: { id: true, verified: true } });
  if (!domain) return { ok: false, error: "Domain not found." };
  if (!domain.verified) return { ok: false, error: "The domain isn't live yet — check its status before making it primary." };

  await prisma.$transaction([
    prisma.domain.updateMany({ where: { tenantId, isPrimary: true }, data: { isPrimary: false } }),
    prisma.domain.update({ where: { id: domain.id }, data: { isPrimary: true } }),
  ]);
  revalidatePath("/w/settings");
  return { ok: true };
}

export async function removeDomain(id: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  // Deregister from Railway first (best-effort), then delete our own row. The tenant
  // guard makes deleteMany a no-op if the row isn't ours.
  const domain = await prisma.domain.findFirst({ where: { id, tenantId }, select: { railwayDomainId: true } });
  if (domain?.railwayDomainId) await railwayDeleteCustomDomain(domain.railwayDomainId);
  await prisma.domain.deleteMany({ where: { id, tenantId } });
  revalidatePath("/w/settings");
  return { ok: true };
}

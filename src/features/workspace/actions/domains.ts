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
  railwayDeleteCustomDomain,
  certIsLive,
} from "@/lib/railway/domains";
import {
  cloudflareConfigured,
  cloudflareProvisionDomain,
  cloudflareDeprovisionDomain,
} from "@/lib/cloudflare/domains";

/**
 * Fully provision a custom domain:
 *  - Railway = ROUTING: register the host so Railway serves this app for that Host.
 *  - Cloudflare = TLS + DNS: create a PROXIED CNAME (host -> this app's host) so
 *    Cloudflare issues the certificate and proxies to Railway. No up.railway.app is
 *    shown to the tenant, and the DNS record is created for them automatically.
 * Verified (→ routable) once Cloudflare's proxied record + cert are in place.
 */
async function provisionDomain(hostname: string): Promise<{
  verified: boolean;
  dnsTarget: string;
  railwayDomainId: string | null;
  certStatus: string;
  error?: string;
}> {
  const origin = appHost();
  let railwayDomainId: string | null = null;
  if (railwayConfigured()) {
    try {
      railwayDomainId = (await railwayCreateCustomDomain(hostname))?.id ?? null;
    } catch {
      /* may already be registered; routing is best-effort and idempotent */
    }
  }
  if (cloudflareConfigured()) {
    try {
      const cf = await cloudflareProvisionDomain(hostname, origin);
      return { verified: cf.ok, dnsTarget: origin, railwayDomainId, certStatus: cf.ok ? "active" : "error", error: cf.error };
    } catch (e) {
      return { verified: false, dnsTarget: origin, railwayDomainId, certStatus: "error", error: e instanceof Error ? e.message : "Cloudflare provisioning failed." };
    }
  }
  return { verified: false, dnsTarget: origin, railwayDomainId, certStatus: "pending" };
}

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
  /** Fallback CNAME target when auto-provisioning is off. */
  cnameTarget: string;
  rootDomain: string;
  /** TRUE when auto-provisioning (Railway routing / Cloudflare cert) is active. */
  railwayManaged: boolean;
  /** TRUE when Cloudflare manages DNS automatically (no manual CNAME for the tenant). */
  autoDns: boolean;
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
  const autoDns = cloudflareConfigured();
  const managed = autoDns || railwayConfigured();
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
    autoDns,
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

  // Auto-provision routing (Railway) + TLS/DNS (Cloudflare). Non-fatal on failure —
  // the row exists and "Check status" retries.
  const p = await provisionDomain(hostname);
  await prisma.domain.update({
    where: { id: domainId },
    data: { railwayDomainId: p.railwayDomainId, dnsTarget: p.dnsTarget, certStatus: p.certStatus, verified: p.verified },
  });

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

  // Auto-provisioned path (Cloudflare and/or Railway configured): (re)provision + refresh.
  if (cloudflareConfigured() || railwayConfigured()) {
    const p = await provisionDomain(domain.hostname);
    await prisma.domain.update({
      where: { id: domain.id },
      data: { railwayDomainId: p.railwayDomainId, dnsTarget: p.dnsTarget, certStatus: p.certStatus, verified: p.verified },
    });
    revalidatePath("/w/settings");
    if (p.verified) return { ok: true };
    return { ok: false, error: p.error ?? "Still provisioning — try Check status again in a minute." };
  }

  // Last-resort fallback (no tokens at all): CNAME auto-detect against this app's host.
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

  // Deregister from Railway + remove the Cloudflare record (both best-effort), then
  // delete our row. The tenant guard makes deleteMany a no-op if the row isn't ours.
  const domain = await prisma.domain.findFirst({ where: { id, tenantId }, select: { hostname: true, railwayDomainId: true } });
  if (domain?.railwayDomainId) await railwayDeleteCustomDomain(domain.railwayDomainId);
  if (domain?.hostname) await cloudflareDeprovisionDomain(domain.hostname);
  await prisma.domain.deleteMany({ where: { id, tenantId } });
  revalidatePath("/w/settings");
  return { ok: true };
}

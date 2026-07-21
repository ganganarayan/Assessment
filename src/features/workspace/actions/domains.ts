"use server";

import { promises as dns } from "dns";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Per-tenant custom domains. Every row is scoped to the acting workspace tenant
 * (requireWorkspace), so a tenant can only ever see/mutate its OWN domains — the
 * hostname column is globally unique, so one tenant claiming a host blocks it for
 * everyone (first-come, and only after CNAME verification does it actually route).
 *
 * Verification = CNAME auto-detect: we confirm the hostname's DNS points at THIS
 * app, then flip `verified` (middleware/getCurrentTenant only routes verified
 * domains). TLS certs are provisioned out-of-band by the platform owner in Railway.
 */

/** The host a tenant must point their CNAME at, e.g. "assess.applygitawisdom.com".
 *  NOT exported: a "use server" file may only export async functions, and this is a
 *  sync helper — exporting it would fail the Next.js build (tsc won't catch it). */
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
  createdAt: string;
}

export interface DomainSettingsView {
  domains: DomainView[];
  cnameTarget: string;
  rootDomain: string;
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
  const rows = await prisma.domain.findMany({
    where: { tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true, hostname: true, isPrimary: true, verified: true, createdAt: true },
  });
  return {
    domains: rows.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      isPrimary: d.isPrimary,
      verified: d.verified,
      createdAt: d.createdAt.toISOString(),
    })),
    cnameTarget: appHost(),
    rootDomain: env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase(),
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

  try {
    await prisma.domain.create({ data: { hostname, tenantId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That domain is already registered." };
    }
    throw e;
  }
  revalidatePath("/w/settings");
  return { ok: true };
}

/** CNAME auto-detect: TRUE when the hostname's DNS resolves to this app. */
async function pointsToUs(hostname: string): Promise<boolean> {
  const target = appHost();
  const root = env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase();

  // 1) CNAME chain names our app host (or any host under our root domain).
  try {
    const cnames = await dns.resolveCname(hostname);
    if (cnames.some((c) => { const h = c.toLowerCase().replace(/\.$/, ""); return h === target || h === root || h.endsWith(`.${root}`); })) {
      return true;
    }
  } catch {
    /* no CNAME (apex/flattened) — fall through to A-record compare */
  }

  // 2) A-record match — apex domains flattened by the DNS provider (ALIAS/ANAME).
  try {
    const [a, b] = await Promise.all([dns.resolve4(hostname), dns.resolve4(target)]);
    if (a.some((ip) => b.includes(ip))) return true;
  } catch {
    /* unresolved */
  }
  return false;
}

export async function verifyDomain(id: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  // Scope: only a row owned by THIS tenant.
  const domain = await prisma.domain.findFirst({ where: { id, tenantId }, select: { id: true, hostname: true, verified: true } });
  if (!domain) return { ok: false, error: "Domain not found." };
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
  if (!domain.verified) return { ok: false, error: "Verify the domain before making it primary." };

  // One primary per tenant — clear the others in the same transaction.
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

  // deleteMany with the tenant guard = a no-op (never an error) if it isn't ours.
  await prisma.domain.deleteMany({ where: { id, tenantId } });
  revalidatePath("/w/settings");
  return { ok: true };
}

"use server";

import { promises as dns } from "dns";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { tenantCan } from "@/lib/billing/gate";
import { env } from "@/lib/env";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  railwayConfigured,
  railwayCreateCustomDomain,
  railwayCustomDomainStatus,
  railwayDeleteCustomDomain,
  certIsLive,
  type RailwayDnsRecord,
} from "@/lib/railway/domains";
import {
  cloudflareConfigured,
  cloudflareProvisionDomain,
  cloudflareDeprovisionDomain,
} from "@/lib/cloudflare/domains";
import { forgetServedHost, forgetRoutedHosts } from "@/lib/tenant/served-host";
import {
  cloudflareSaasConfigured,
  cloudflareSaasFallbackOrigin,
  cloudflareCreateCustomHostname,
  cloudflareCustomHostnameStatus,
  cloudflareFindCustomHostname,
  cloudflareDeleteCustomHostname,
  saasCertIsLive,
} from "@/lib/cloudflare/saas";

/**
 * Fully provision a custom domain:
 *  - Railway = ROUTING: register the host so Railway serves this app for that Host.
 *  - Cloudflare = TLS + DNS: create a PROXIED CNAME (host -> this app's host) so
 *    Cloudflare issues the certificate and proxies to Railway. No up.railway.app is
 *    shown to the tenant, and the DNS record is created for them automatically.
 * Verified (→ routable) once Cloudflare's proxied record + cert are in place.
 */
async function provisionDomain(
  hostname: string,
  existingRailwayId?: string | null,
  existingCfId?: string | null,
): Promise<{
  verified: boolean;
  dnsTarget: string;
  dnsRecords: RailwayDnsRecord[];
  railwayDomainId: string | null;
  cfHostnameId: string | null;
  certStatus: string;
  error?: string;
}> {
  const origin = appHost();

  // ── Cloudflare for SaaS, when configured: the path that scales ──────────────────
  // Railway caps custom domains per service by plan, so one slot per tenant domain is
  // a hard ceiling on the business. A custom hostname uses no slot at all: Cloudflare
  // terminates TLS for the customer's host and forwards to us, and the Worker rewrites
  // the Host to one Railway already routes. Railway is never told about the host.
  if (cloudflareSaasConfigured()) {
    const fallback = cloudflareSaasFallbackOrigin() ?? origin;
    try {
      const ch =
        (existingCfId ? await cloudflareCustomHostnameStatus(existingCfId) : null) ??
        (await cloudflareFindCustomHostname(hostname)) ??
        (await cloudflareCreateCustomHostname(hostname));
      if (ch) {
        const live = saasCertIsLive(ch.sslStatus, ch.status);
        return {
          verified: live,
          dnsTarget: fallback,
          dnsRecords: ch.dnsRecords,
          railwayDomainId: null,
          cfHostnameId: ch.id,
          certStatus: ch.sslStatus ?? ch.status ?? "pending",
        };
      }
    } catch (e) {
      // Fall through to Railway rather than dead-ending: a misconfigured zone should
      // degrade to the old path, not stop a tenant from adding a domain at all.
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[domains] Cloudflare for SaaS provisioning failed:", msg);
    }
  }

  // Routing + TLS (Railway) — the SOURCE OF TRUTH. Railway routes by Host and issues
  // the Let's Encrypt cert once DNS resolves; it also tells us the exact DNS records
  // the domain owner must add. On "Check status" we POLL the existing record rather
  // than re-create (customDomainCreate errors on an already-registered host).
  let rw = null as Awaited<ReturnType<typeof railwayCreateCustomDomain>>;
  let railwayError: string | null = null;
  if (railwayConfigured()) {
    try {
      rw = existingRailwayId ? await railwayCustomDomainStatus(existingRailwayId, hostname) : null;
      if (!rw) rw = await railwayCreateCustomDomain(hostname);
      if (!rw) railwayError = "Railway returned no domain.";
    } catch (e) {
      railwayError = e instanceof Error ? e.message : String(e);
    }
  }

  // TLS + DNS (Cloudflare) — only succeeds for zones on OUR Cloudflare account (the
  // domains we host). For a client's OWN domain this simply fails, which is fine: the
  // client adds the DNS records shown below instead. Never a verification gate.
  if (cloudflareConfigured()) {
    try {
      await cloudflareProvisionDomain(hostname, origin);
    } catch {
      /* external zone — not ours to manage; the shown records are the path */
    }
  }

  const railwayDomainId = rw?.id ?? existingRailwayId ?? null;
  const certLive = certIsLive(rw?.certStatus);
  // Verified = the cert is live. When Railway manages routing that IS the truth; with
  // no Railway token we fall back to the CNAME auto-detect path in verifyDomain.
  const verified = railwayConfigured() ? certLive : false;

  // Records to hand the owner: Railway's when managed; otherwise a single CNAME to us.
  const dnsRecords: RailwayDnsRecord[] =
    rw?.dnsRecords && rw.dnsRecords.length > 0
      ? rw.dnsRecords
      : railwayConfigured()
        ? []
        : [{ type: "CNAME", name: hostname, value: origin, purpose: null, status: null }];

  return {
    verified,
    dnsTarget: rw?.dnsTarget ?? origin,
    dnsRecords,
    railwayDomainId,
    cfHostnameId: null,
    // Keep Railway's own words when present (ISSUING/ISSUED/…); else pending/active.
    // 🔴 A Railway failure used to vanish here: the row was created, Railway knew
    // nothing about the host, and the tenant was handed a CNAME pointing at our app
    // host instead of their routing target — DNS they could add and wait on forever.
    // Carry the error into certStatus so the badge says so (certIsLive treats anything
    // containing "error" as not live, which is correct).
    certStatus:
      rw?.certStatus ?? (verified ? "active" : railwayError ? `ERROR — ${railwayError.slice(0, 120)}` : "pending"),
    // Only surface a real Railway error — a Cloudflare miss on an external zone is expected.
    error: railwayError ?? undefined,
  };
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

/**
 * The DNS Name field as a provider wants it: the sub-domain LABEL, not the full host.
 * Cloudflare/GoDaddy/Namecheap append the zone to whatever is typed, so an FQDN here
 * produces a doubled record. Leaves an already-short label alone.
 */
function recordLabel(name: string | null | undefined, hostname: string): string {
  const n = (name ?? "").trim().replace(/\.$/, "").toLowerCase();
  const host = hostname.trim().replace(/\.$/, "").toLowerCase();
  if (!n) return n;
  if (n !== host && !n.endsWith(`.${host}`)) return n; // already a label, or unrelated
  const parts = host.split(".").filter(Boolean);
  return parts.length <= 2 ? "@" : parts.slice(0, parts.length - 2).join(".");
}

/** The host a tenant points their CNAME at when Railway auto-provisioning is OFF. */
function appHost(): string {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL).host.toLowerCase();
  } catch {
    // APP_URL malformed and no root configured: nothing sensible to point a CNAME at.
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
  /** DNS records the owner must add at their provider (shown until the domain is live). */
  dnsRecords: RailwayDnsRecord[];
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
  /** FALSE on Free: the add form is replaced by an upgrade note. Existing domains
   *  still render and keep working — only adding a new one is gated. */
  canAdd: boolean;
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
  // SaaS counts as managed: the certificate is issued for us, so the tenant adds one
  // CNAME and waits rather than being told to configure anything themselves.
  const managed = autoDns || cloudflareSaasConfigured() || railwayConfigured();
  const fallback = appHost();
  const rows = await prisma.domain.findMany({
    where: { tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true, hostname: true, isPrimary: true, verified: true, dnsTarget: true, certStatus: true, dnsRecords: true, createdAt: true },
  });
  return {
    domains: rows.map((d) => {
      const live = d.verified || certIsLive(d.certStatus);
      const stored = (d.dnsRecords as unknown as RailwayDnsRecord[] | null) ?? [];
      // Rows written before the label fix stored the raw enum ("DNS_RECORD_TYPE_CNAME").
      // Clean it on read too, so existing domains show the bare record type (CNAME/TXT).
      const norm = stored.map((r) => ({
        ...r,
        type: (r.type || "CNAME").replace(/^DNS_RECORD_TYPE_/i, "").toUpperCase(),
        // Rows written before the label fix stored the FQDN. Providers append the zone
        // themselves, so showing the full host makes people create
        // assess.acme.com.acme.com. Convert on read; no re-check needed.
        name: recordLabel(r.name, d.hostname),
      }));
      // Show records until the domain is live. Fall back to a single CNAME when none
      // were stored (older rows, or no-Railway fallback), so there is always guidance.
      const dnsRecords = live
        ? []
        : norm.length > 0
          ? norm
          // recordLabel, not the raw host: this fallback branch is the one that runs
          // whenever Railway hands back no records, so writing the FQDN here undid the
          // label fix everywhere it actually mattered.
          : [{ type: "CNAME", name: recordLabel(d.hostname, d.hostname), value: d.dnsTarget ?? fallback, purpose: null, status: null }];
      return {
        id: d.id,
        hostname: d.hostname,
        isPrimary: d.isPrimary,
        verified: d.verified,
        dnsTarget: d.dnsTarget ?? (managed ? null : fallback),
        certStatus: d.certStatus,
        certLive: certIsLive(d.certStatus),
        dnsRecords,
        createdAt: d.createdAt.toISOString(),
      };
    }),
    cnameTarget: fallback,
    rootDomain: env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase(),
    railwayManaged: managed,
    autoDns,
    canAdd: await tenantCan(tenantId, "customDomain"),
  };
}

export async function addDomain(rawHostname: string): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  // Billing gate: bring-your-own domain is a paid capability. Checked here rather than
  // only hiding the form, because the form is a client component and a server action is
  // callable directly.
  //
  // Only ADDING is gated. An existing domain keeps resolving if a tenant lapses to Free:
  // pulling a live domain would take down whatever traffic is already pointed at it,
  // which is a customer outage rather than a downgrade. Reclaiming those is a separate,
  // deliberate decision.
  if (!(await tenantCan(tenantId, "customDomain"))) {
    return {
      ok: false,
      error: "Custom domains are available on the paid plans. Upgrade to connect your own domain.",
    };
  }

  const parsed = hostnameSchema.safeParse(rawHostname);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid domain." };
  const hostname = parsed.data;

  // With no root configured there are no automatic subdomains and no reserved apex,
  // so there is nothing to refuse: every host is a custom domain, including this one.
  const root = env.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase();
  if (root) {
    // Two different refusals wearing one message. Typing the root itself is not "a
    // subdomain is automatic" — it is the app's own address, and saying so is the
    // difference between a user who understands and one who retypes it three times.
    if (hostname === root) {
      return {
        ok: false,
        error: `${root} is the app's own address (NEXT_PUBLIC_ROOT_DOMAIN), so it can't also be a workspace's custom domain. Unset that variable, or move the platform to its own host, and this one is free to add.`,
      };
    }
    if (hostname.endsWith(`.${root}`)) {
      return { ok: false, error: `Subdomains of ${root} are automatic — you only need this for your OWN domain.` };
    }
  }

  let domainId: string;
  try {
    const row = await prisma.domain.create({ data: { hostname, tenantId }, select: { id: true } });
    domainId = row.id;
    // If anyone hit this host before it was registered, "not ours" is cached. Clear
    // both caches so the domain authenticates the instant it routes here, rather than
    // after the TTL.
    forgetServedHost(hostname);
    forgetRoutedHosts();
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
    data: {
      railwayDomainId: p.railwayDomainId,
      cfHostnameId: p.cfHostnameId,
      dnsTarget: p.dnsTarget,
      dnsRecords: p.dnsRecords as unknown as Prisma.InputJsonValue,
      certStatus: p.certStatus,
      verified: p.verified,
    },
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
    // 🔴 Guard the empty root: without it `h.endsWith(".")` is the test, which is true
    // for a trailing-dot FQDN — every domain on earth would verify as pointing at us.
    if (cnames.some((c) => {
      const h = c.toLowerCase().replace(/\.$/, "");
      return h === target || (!!root && (h === root || h.endsWith(`.${root}`)));
    })) {
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
    select: { id: true, hostname: true, verified: true, railwayDomainId: true, cfHostnameId: true },
  });
  if (!domain) return { ok: false, error: "Domain not found." };

  // Auto-provisioned path (Cloudflare and/or Railway configured): poll status + refresh.
  if (cloudflareSaasConfigured() || cloudflareConfigured() || railwayConfigured()) {
    const p = await provisionDomain(domain.hostname, domain.railwayDomainId, domain.cfHostnameId);
    await prisma.domain.update({
      where: { id: domain.id },
      data: {
        railwayDomainId: p.railwayDomainId,
        cfHostnameId: p.cfHostnameId,
        dnsTarget: p.dnsTarget,
        dnsRecords: p.dnsRecords as unknown as Prisma.InputJsonValue,
        certStatus: p.certStatus,
        verified: p.verified,
      },
    });
    revalidatePath("/w/settings");
    if (p.verified) return { ok: true };
    return {
      ok: false,
      error:
        p.error ??
        "Not live yet — add the DNS records shown below at your provider, then Check status again in a minute.",
    };
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
  const domain = await prisma.domain.findFirst({ where: { id, tenantId }, select: { hostname: true, railwayDomainId: true, cfHostnameId: true } });
  if (domain?.railwayDomainId) await railwayDeleteCustomDomain(domain.railwayDomainId);
  // Release the Cloudflare custom hostname too, or it keeps counting against the
  // account's hostname quota long after the tenant removed the domain.
  if (domain?.cfHostnameId) await cloudflareDeleteCustomHostname(domain.cfHostnameId);
  if (domain?.hostname) await cloudflareDeprovisionDomain(domain.hostname);
  await prisma.domain.deleteMany({ where: { id, tenantId } });
  // Drop the cached "we serve this host" answer immediately. Without this a removed
  // domain would keep authenticating for up to the cache TTL.
  forgetServedHost(domain?.hostname);
  forgetRoutedHosts();
  revalidatePath("/w/settings");
  return { ok: true };
}

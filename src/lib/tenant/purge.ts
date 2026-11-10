import "server-only";
import { prisma } from "@/lib/db/prisma";
import { railwayDeleteCustomDomain } from "@/lib/railway/domains";
import { cloudflareDeprovisionDomain } from "@/lib/cloudflare/domains";
import { cloudflareDeleteCustomHostname } from "@/lib/cloudflare/saas";
import { forgetServedHost, forgetRoutedHosts } from "@/lib/tenant/served-host";
import { storage, isStorageConfigured } from "@/lib/storage/r2";
import { loadBucketCreds, deleteObject, type VaultBucketCreds } from "@/features/vault/client";

/**
 * PERMANENT tenant delete, done explicitly (Phase 2 of the multi-tenant review).
 *
 * 🔴 WHY NOT JUST `tenant.delete`. Several of a tenant's tables point at it with
 * ON DELETE SET NULL: assessments, submissions, payments, payment links, result pages,
 * CAPI and webhook logs, vault rows. A cascade therefore did not delete a business, it
 * ORPHANED it - and `tenantId = null` is the platform's own convention, so the purged
 * tenant's funnels, leads and result pages quietly became the platform's, able to go
 * live on the platform host. A dozen more tables carry a bare tenant id with no foreign
 * key at all and were simply left behind.
 *
 * So every row is deleted by name, in ONE transaction: either the whole business goes
 * or none of it does. External resources (the Railway or Cloudflare domain slot, R2
 * objects) cannot join a database transaction, so they are released AFTER it commits -
 * never before, or a rolled-back delete would leave a live tenant with no domain.
 *
 * Kept on purpose:
 *  - LOGINS. Detached, not deleted, exactly as before; an account is a person, not data.
 *  - SUBSCRIPTION payments (purpose "subscription"). Those are the platform's revenue
 *    ledger, the money this tenant paid the platform. They lose the tenant link and keep
 *    the amount, which is what the Accounts page reads.
 *  - AI usage rows. They are the platform's cost ledger; the provider billed for them
 *    whether or not the tenant still exists.
 */
export interface PurgeReport {
  domainsReleased: string[];
  storageObjectsRemoved: number;
  vaultObjectsRemoved: number;
  /** What could not be cleaned up outside the database, for the audit log. */
  leftovers: string[];
}

export async function purgeTenantEverywhere(tenantId: string): Promise<PurgeReport> {
  // Read everything external BEFORE the rows that describe it are gone.
  const domains = await prisma.domain.findMany({
    where: { tenantId },
    select: { hostname: true, railwayDomainId: true, cfHostnameId: true },
  });
  const vaultFiles = await prisma.vaultFile.findMany({
    where: { tenantId },
    select: { bucketId: true, objectKey: true },
  });
  // Bucket credentials too: they live on the bucket rows the transaction removes.
  const byBucket = new Map<string, string[]>();
  for (const f of vaultFiles) byBucket.set(f.bucketId, [...(byBucket.get(f.bucketId) ?? []), f.objectKey]);
  const bucketCreds = new Map<string, VaultBucketCreds | string>();
  for (const bucketId of byBucket.keys()) {
    try {
      bucketCreds.set(bucketId, await loadBucketCreds(bucketId));
    } catch (e) {
      bucketCreds.set(bucketId, e instanceof Error ? e.message : String(e));
    }
  }

  await prisma.$transaction(
    async (tx) => {
      const t = { tenantId };
      // Logins survive the delete (see above).
      await tx.user.updateMany({ where: t, data: { tenantId: null } });

      // Rows with a bare tenant id and no foreign key: nothing would ever remove them.
      await tx.pageView.deleteMany({ where: t });
      await tx.gateEntry.deleteMany({ where: t });
      await tx.gateDisqualification.deleteMany({ where: t });
      await tx.funnelEventCount.deleteMany({ where: t });
      await tx.ctaClick.deleteMany({ where: t });
      await tx.eventLog.deleteMany({ where: t });
      await tx.webhookDelivery.deleteMany({ where: t });
      await tx.automationSend.deleteMany({ where: t });
      await tx.automationRun.deleteMany({ where: t });
      await tx.workflowSend.deleteMany({ where: t });
      await tx.workflowRun.deleteMany({ where: t });
      await tx.broadcastRecipient.deleteMany({ where: t });
      await tx.lifecyclePlan.deleteMany({ where: t });

      // Booking types and assessments may point at an ad account with ON DELETE
      // RESTRICT, so they have to go before the cascade reaches the ad accounts.
      await tx.bookingType.deleteMany({ where: t });
      // Rows that were SET NULL by the cascade: the business itself.
      await tx.submission.deleteMany({ where: t });
      await tx.assessment.deleteMany({ where: t });
      await tx.resultPageDoc.deleteMany({ where: t });
      await tx.paymentLink.deleteMany({ where: t });
      await tx.payment.deleteMany({ where: { tenantId, purpose: { not: "subscription" } } });
      await tx.capiLog.deleteMany({ where: t });
      await tx.webhookLog.deleteMany({ where: t });
      await tx.vaultActivity.deleteMany({ where: t });
      await tx.vaultFile.deleteMany({ where: t });
      await tx.vaultFolder.deleteMany({ where: t });
      await tx.vaultBucket.deleteMany({ where: t });

      // Everything left cascades from the tenant row (domains, settings, contacts,
      // workflows, automations, broadcasts, calendar, staff tokens...).
      await tx.tenant.delete({ where: { id: tenantId } });
    },
    // A busy tenant has a lot of page views; the default 5s would roll a large one back.
    { timeout: 120_000, maxWait: 10_000 },
  );

  const report: PurgeReport = { domainsReleased: [], storageObjectsRemoved: 0, vaultObjectsRemoved: 0, leftovers: [] };

  // The domain slot: Railway caps custom domains per service, so a purged tenant that
  // keeps one is a paying customer who cannot connect theirs. Each release is already
  // best-effort and never throws.
  for (const d of domains) {
    if (d.railwayDomainId) await railwayDeleteCustomDomain(d.railwayDomainId);
    if (d.cfHostnameId) await cloudflareDeleteCustomHostname(d.cfHostnameId);
    await cloudflareDeprovisionDomain(d.hostname);
    forgetServedHost(d.hostname);
    report.domainsReleased.push(d.hostname);
  }
  if (domains.length > 0) forgetRoutedHosts();

  // R2: the tenant's own prefix in the platform bucket (reports, support attachments).
  try {
    if (await isStorageConfigured()) report.storageObjectsRemoved = await storage.deletePrefix(`tenants/${tenantId}/`);
  } catch (e) {
    report.leftovers.push(`storage prefix tenants/${tenantId}/: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Vault objects live under minted keys in their own buckets, so they are removed one
  // by one with each bucket's credentials, read before the bucket rows were deleted.
  for (const [bucketId, keys] of byBucket) {
    const creds = bucketCreds.get(bucketId);
    if (!creds || typeof creds === "string") {
      report.leftovers.push(`vault bucket ${bucketId}: ${keys.length} object(s) not removed (${creds ?? "no credentials"})`);
      continue;
    }
    let failed = 0;
    for (const k of keys) {
      try {
        await deleteObject(creds, k);
        report.vaultObjectsRemoved += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) report.leftovers.push(`vault bucket ${bucketId}: ${failed} object(s) not removed`);
  }
  return report;
}

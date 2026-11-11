/**
 * The disposable workspaces the tenancy pass drives.
 *
 * Everything this writes carries the prefix "qa-tn-" (slugs) or "qa-tn-" in the local
 * part of an email, so `--cleanup` can find every row of every run, including a run that
 * died half way.
 *
 *  - Workspace A: a manual Gate grant (2 live funnels) with THREE published funnels, so
 *    the third one is over plan. Its admin is the login that gets suspended.
 *  - Workspace B: a manual Agency grant (API access on), one funnel, one API token, and
 *    the captures the cross-tenant checks try to reach from A.
 *
 * Written straight to the database rather than through signup on purpose: signup is
 * itself under test (see checks.ts), and a fixture that depends on the thing it tests
 * cannot tell a broken fixture from a broken feature.
 */
import { randomBytes, createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db, withDbRetry } from "../db.js";

export const PREFIX = "qa-tn-";

export interface SeededTenant {
  id: string;
  adminUserId: string;
  slug: string;
  name: string;
  adminEmail: string;
  adminPassword: string;
  /** Funnel slugs in publish order (earliest first). */
  funnels: string[];
  submissionId: string;
}

export interface Seed {
  runId: string;
  a: SeededTenant;
  b: SeededTenant;
  /** API token labels, one per workspace, for the token isolation check. */
  tokenLabelA: string;
  tokenLabelB: string;
  /** Captures in their own amount bands, for the purchase event-id fence. */
  capturePlatform: { paymentId: string; rupees: number };
  captureB: { paymentId: string; rupees: number };
  /** Phase 3: A's brand, as it should show on A's funnels and report. */
  brandA: { primary: string; favicon: string; share: string; privacy: string; terms: string };
  /** A completed result in A, for the PDF report. */
  reportSubmissionId: string;
  /** Phase 4: B sells in USD on New York time. */
  zoneB: string;
  payTokenB: string;
  bookingSlugB: string;
  /** Phase 5: a view-only staff login in A, an edit staff login in B, a client under B. */
  staffA: { email: string; password: string };
  staffB: { email: string; password: string };
  clientB: { id: string; name: string };
}

/** One login with a password typed into nothing: generated here, used by the pass, gone after. */
async function makeLogin(tenantId: string, email: string, name: string, staffPermission: "VIEW" | "EDIT" | null): Promise<{ id: string; password: string }> {
  const password = randomBytes(18).toString("base64url");
  // loginCount past five: the welcome modal blocks the first five logins and would sit
  // over every screen this pass reads.
  const user = await db().user.create({
    data: { name, email, role: "ADMIN", tenantId, emailVerified: true, loginCount: 50, staffPermission },
    select: { id: true },
  });
  await db().account.create({
    data: { accountId: user.id, providerId: "credential", password: await hashPassword(password), userId: user.id },
    select: { id: true },
  });
  return { id: user.id, password };
}

const DAY = 24 * 60 * 60 * 1000;

async function makeTenant(
  runId: string,
  key: "a" | "b",
  plan: "GATE" | "AGENCY",
  funnelCount: number,
  emailDomain: string,
): Promise<SeededTenant> {
  const slug = `${PREFIX}${key}-${runId}`;
  const name = `QA Tenancy ${key.toUpperCase()} ${runId}`;
  const tenant = await db().tenant.create({
    // startTrialFiredAt stamped at birth: the first open of a workspace reports StartTrial
    // to the PLATFORM pixel, which on prod is live. A test workspace is not a trial.
    data: { slug, name, plan, planExpiresAt: new Date(Date.now() + 30 * DAY), startTrialFiredAt: new Date() },
    select: { id: true },
  });

  const adminEmail = `${PREFIX}${key}-${runId}@${emailDomain}`;
  const admin = await makeLogin(tenant.id, adminEmail, `QA ${key.toUpperCase()}`, null);
  const adminPassword = admin.password;

  const funnels: string[] = [];
  let submissionId = "";
  for (let i = 1; i <= funnelCount; i++) {
    const fslug = `${PREFIX}${key}${i}-${runId}`;
    // Published one minute apart, oldest first, so "the earliest published stay live"
    // has an unambiguous answer.
    const publishedAt = new Date(Date.now() - (funnelCount - i + 1) * 60_000);
    const a = await db().assessment.create({
      data: {
        slug: fslug,
        title: `QA tenancy ${key.toUpperCase()}${i}`,
        status: "PUBLISHED",
        publishedAt,
        tenantId: tenant.id,
        collectProfession: false,
        professionRequired: false,
        fireMetaCapi: false,
        useAiStatement: false,
        paidMode: false,
        categories: {
          create: [
            {
              name: "Only",
              page: 1,
              displayOrder: 0,
              questions: {
                create: [
                  {
                    text: "Is this a test?",
                    type: "SINGLE_SELECT",
                    weight: 1,
                    required: true,
                    displayOrder: 0,
                    options: { create: [{ label: "Yes", value: 1, displayOrder: 0 }, { label: "No", value: 0, displayOrder: 1 }] },
                  },
                ],
              },
            },
          ],
        },
      },
      select: { id: true },
    });
    funnels.push(fslug);
    if (i === 1) {
      const s = await db().submission.create({
        data: { assessmentId: a.id, tenantId: tenant.id, leadEmail: `${PREFIX}lead-${key}-${runId}@${emailDomain}`, isPreview: true },
        select: { id: true },
      });
      submissionId = s.id;
    }
  }
  return { id: tenant.id, adminUserId: admin.id, slug, name, adminEmail, adminPassword, funnels, submissionId };
}

async function makeToken(tenantId: string, label: string): Promise<void> {
  const plaintext = `qa_${randomBytes(16).toString("hex")}`;
  await db().apiToken.create({
    data: {
      tenantId,
      label,
      scope: "meta_match",
      prefix: plaintext.slice(0, 8),
      tokenHash: createHash("sha256").update(plaintext).digest("hex"),
      // Revoked from birth: it exists to be LISTED, and a live bearer key that nobody
      // holds is still a live bearer key.
      revokedAt: new Date(),
    },
    select: { id: true },
  });
}

export async function seedTenancy(runId: string, emailDomain: string): Promise<Seed> {
  return withDbRetry(async () => {
    const a = await makeTenant(runId, "a", "GATE", 3, emailDomain);
    const b = await makeTenant(runId, "b", "AGENCY", 1, emailDomain);
    const tokenLabelA = `${PREFIX}token-a-${runId}`;
    const tokenLabelB = `${PREFIX}token-b-${runId}`;
    await makeToken(a.id, tokenLabelA);
    await makeToken(b.id, tokenLabelB);

    // Amount bands nobody else uses, so the endpoint's answer can only be one of these.
    const capturePlatform = { paymentId: `pay_qatnp${runId}`, rupees: 77778 };
    const captureB = { paymentId: `pay_qatnb${runId}`, rupees: 77777 };
    await db().capiLog.create({
      data: { providerPaymentId: capturePlatform.paymentId, amountPaise: capturePlatform.rupees * 100 + 1, eventName: "Purchase", status: "qa-fixture", response: "qa tenancy fixture, never sent", tenantId: null },
      select: { id: true },
    });
    await db().capiLog.create({
      data: { providerPaymentId: captureB.paymentId, amountPaise: captureB.rupees * 100 + 1, eventName: "Purchase", status: "qa-fixture", response: "qa tenancy fixture, never sent", tenantId: b.id },
      select: { id: true },
    });
    // --- Phase 3: A's brand and legal links ---------------------------------------
    const brandA = {
      primary: "#1a7f5a",
      favicon: `https://example.com/${PREFIX}favicon-${runId}.png`,
      share: `https://example.com/${PREFIX}share-${runId}.png`,
      privacy: `https://example.com/${PREFIX}privacy-${runId}`,
      terms: `https://example.com/${PREFIX}terms-${runId}`,
    };
    await db().theme.create({
      data: { tenantId: a.id, primaryColor: brandA.primary, secondaryColor: "#f5a623", faviconUrl: brandA.favicon, shareImageUrl: brandA.share },
      select: { id: true },
    });
    await db().appSetting.create({
      data: { id: `tenant_${a.id}`, tenantId: a.id, privacyUrl: brandA.privacy, termsUrl: brandA.terms, reportDisclaimer: `QA closing line ${runId}` },
      select: { id: true },
    });
    const firstA = await db().assessment.findUniqueOrThrow({ where: { slug: a.funnels[0] ?? "" }, select: { id: true } });
    const report = await db().submission.create({
      data: {
        assessmentId: firstA.id,
        tenantId: a.id,
        isPreview: true,
        status: "COMPLETED",
        completedAt: new Date(),
        leadFirstName: "Qa",
        leadEmail: `${PREFIX}report-${runId}@${emailDomain}`,
        resultSnapshot: {
          customerId: "qa",
          scorePercent: 72,
          scoreRaw: 1,
          max: 1,
          resultBand: null,
          resultSuggestion: null,
          aiStatement: null,
          categories: [{ name: "Only", score: 1, max: 1, band: null, meaning: null }],
        },
      },
      select: { id: true },
    });

    // --- Phase 4: B sells in USD on New York time -------------------------------
    const zoneB = "America/New_York";
    await db().appSetting.create({
      data: { id: `tenant_${b.id}`, tenantId: b.id, timeZone: zoneB, paymentCurrency: "USD" },
      select: { id: true },
    });
    const payTokenB = `qatn${runId}${randomBytes(6).toString("hex")}`;
    await db().paymentLink.create({
      data: { token: payTokenB, tenantId: b.id, submissionId: b.submissionId, amountPaise: 1999, minPaise: 50, currency: "USD" },
      select: { id: true },
    });
    const bookingSlugB = `${PREFIX}book-${runId}`;
    await db().bookingType.create({
      data: {
        tenantId: b.id,
        name: `QA booking ${runId}`,
        slug: bookingSlugB,
        durationMin: 30,
        noticeMin: 0,
        horizonDays: 14,
        assignedUserId: b.adminUserId,
        fireMetaCapi: false,
        // 09:00 to 17:00 every day, on the WORKSPACE's clock.
        rules: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 540, endMin: 1020 })) },
      },
      select: { id: true },
    });

    // --- Phase 5: staff and an agency client --------------------------------------
    const staffAEmail = `${PREFIX}staffa-${runId}@${emailDomain}`;
    const staffA = { email: staffAEmail, password: (await makeLogin(a.id, staffAEmail, "QA view staff", "VIEW")).password };
    const staffBEmail = `${PREFIX}staffb-${runId}@${emailDomain}`;
    const staffB = { email: staffBEmail, password: (await makeLogin(b.id, staffBEmail, "QA edit staff", "EDIT")).password };
    const clientName = `QA Client ${runId}`;
    const client = await db().tenant.create({
      data: { slug: `${PREFIX}b2-${runId}`, name: clientName, agencyAdminTenantId: b.id, startTrialFiredAt: new Date() },
      select: { id: true },
    });
    const clientFunnel = await db().assessment.create({
      data: { slug: `${PREFIX}b2f-${runId}`, title: "QA client funnel", status: "DRAFT", tenantId: client.id, collectProfession: false },
      select: { id: true },
    });
    await db().submission.create({ data: { assessmentId: clientFunnel.id, tenantId: client.id, isPreview: true }, select: { id: true } });

    return {
      runId,
      a,
      b,
      tokenLabelA,
      tokenLabelB,
      capturePlatform,
      captureB,
      brandA,
      reportSubmissionId: report.id,
      zoneB,
      payTokenB,
      bookingSlugB,
      staffA,
      staffB,
      clientB: { id: client.id, name: clientName },
    };
  }, "seeding the tenancy fixtures");
}

/**
 * Remove every qa-tn- row of every run. Child rows first: several tables point at a
 * tenant with SET NULL, and a tenant deleted before them would hand them to the
 * platform, which is the exact bug the purge exists to prevent.
 *
 * Audit rows stay. They have no foreign key and outliving the workspace is their job.
 */
export async function cleanupTenancy(): Promise<string[]> {
  return withDbRetry(async () => {
    const out: string[] = [];
    const tenants = await db().tenant.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true, slug: true } });
    // Signup derives its slug from the name, so the signup check's workspace is found by
    // its login's email instead.
    const users = await db().user.findMany({ where: { OR: [{ email: { startsWith: PREFIX } }, { email: { contains: `+${PREFIX}` } }] }, select: { id: true, tenantId: true } });
    const ids = [...new Set([...tenants.map((t) => t.id), ...users.map((u) => u.tenantId).filter((x): x is string => !!x)])];
    const where = { tenantId: { in: ids } };
    await db().capiLog.deleteMany({ where: { OR: [where, { providerPaymentId: { startsWith: "pay_qatn" } }] } });
    await db().payment.deleteMany({ where: { OR: [where, { providerPaymentId: { startsWith: "pay_qatn" } }] } });
    await db().paymentLink.deleteMany({ where });
    await db().bookingType.deleteMany({ where });
    await db().pageView.deleteMany({ where });
    await db().webhookDelivery.deleteMany({ where });
    await db().aiUsage.deleteMany({ where: { OR: [where, { model: { startsWith: PREFIX } }] } });
    await db().submission.deleteMany({ where });
    await db().assessment.deleteMany({ where });
    await db().user.updateMany({ where: { tenantId: { in: ids } }, data: { tenantId: null } });
    // Client workspaces first: agencyAdminTenantId is ON DELETE RESTRICT.
    const clients = await db().tenant.deleteMany({ where: { id: { in: ids }, agencyAdminTenantId: { not: null } } });
    const gone = await db().tenant.deleteMany({ where: { id: { in: ids } } });
    gone.count += clients.count;
    if (gone.count) out.push(`${gone.count} workspace(s)`);
    const userIds = users.map((u) => u.id);
    await db().session.deleteMany({ where: { userId: { in: userIds } } });
    await db().account.deleteMany({ where: { userId: { in: userIds } } });
    const u = await db().user.deleteMany({ where: { id: { in: userIds } } });
    if (u.count) out.push(`${u.count} login(s)`);
    return out;
  }, "cleaning up the tenancy fixtures");
}

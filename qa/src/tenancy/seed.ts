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
    data: { slug, name, plan, planExpiresAt: new Date(Date.now() + 30 * DAY) },
    select: { id: true },
  });

  const adminEmail = `${PREFIX}${key}-${runId}@${emailDomain}`;
  const adminPassword = randomBytes(18).toString("base64url");
  // loginCount past five: the welcome modal blocks the first five logins and would sit
  // over every screen this pass reads.
  const user = await db().user.create({
    data: { name: `QA ${key.toUpperCase()}`, email: adminEmail, role: "ADMIN", tenantId: tenant.id, emailVerified: true, loginCount: 50 },
    select: { id: true },
  });
  await db().account.create({
    data: { accountId: user.id, providerId: "credential", password: await hashPassword(adminPassword), userId: user.id },
    select: { id: true },
  });

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
  return { id: tenant.id, slug, name, adminEmail, adminPassword, funnels, submissionId };
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
      data: { providerPaymentId: capturePlatform.paymentId, amountPaise: capturePlatform.rupees * 100 + 1, eventName: "Purchase", status: "failed", response: "qa tenancy fixture, never sent", tenantId: null },
      select: { id: true },
    });
    await db().capiLog.create({
      data: { providerPaymentId: captureB.paymentId, amountPaise: captureB.rupees * 100 + 1, eventName: "Purchase", status: "failed", response: "qa tenancy fixture, never sent", tenantId: b.id },
      select: { id: true },
    });
    return { runId, a, b, tokenLabelA, tokenLabelB, capturePlatform, captureB };
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
    const users = await db().user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true, tenantId: true } });
    const ids = [...new Set([...tenants.map((t) => t.id), ...users.map((u) => u.tenantId).filter((x): x is string => !!x)])];
    const where = { tenantId: { in: ids } };
    await db().capiLog.deleteMany({ where: { OR: [where, { providerPaymentId: { startsWith: "pay_qatn" } }] } });
    await db().payment.deleteMany({ where: { OR: [where, { providerPaymentId: { startsWith: "pay_qatn" } }] } });
    await db().paymentLink.deleteMany({ where });
    await db().pageView.deleteMany({ where });
    await db().webhookDelivery.deleteMany({ where });
    await db().aiUsage.deleteMany({ where: { OR: [where, { model: { startsWith: PREFIX } }] } });
    await db().submission.deleteMany({ where });
    await db().assessment.deleteMany({ where });
    await db().user.updateMany({ where: { tenantId: { in: ids } }, data: { tenantId: null } });
    const gone = await db().tenant.deleteMany({ where: { id: { in: ids } } });
    if (gone.count) out.push(`${gone.count} workspace(s)`);
    const userIds = users.map((u) => u.id);
    await db().session.deleteMany({ where: { userId: { in: userIds } } });
    await db().account.deleteMany({ where: { userId: { in: userIds } } });
    const u = await db().user.deleteMany({ where: { id: { in: userIds } } });
    if (u.count) out.push(`${u.count} login(s)`);
    return out;
  }, "cleaning up the tenancy fixtures");
}

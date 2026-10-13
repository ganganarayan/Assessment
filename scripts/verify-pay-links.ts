/**
 * verify:pay-links - read-only pre-flight for hand-sent payment links.
 *
 * What it proves, per tenant that has any Razorpay configuration at all:
 *   - which of the two accounts (GST / Non-GST) can actually take money, so a link is
 *     never generated on keys that do not exist;
 *   - that each configured account's keys are ACCEPTED BY RAZORPAY, by fetching one
 *     order-less read from its API - a typo in a secret is otherwise discovered by a
 *     client on a payment page;
 *   - that both accounts have a webhook secret, because the webhook is what books a
 *     sale when the payer closes the tab on the way back;
 *   - that the two accounts are not the SAME key id, which would mean one of them is a
 *     copy-paste mistake and the GST split in reporting is fiction;
 *   - the state of existing links, and any that have been sitting unpaid for a while.
 *
 * What it cannot prove: that a payment succeeds. That needs one real transaction.
 *
 *   railway run --environment orbitq-assess npm run verify:pay-links     (staging)
 *   railway run --environment production    npm run verify:pay-links     (prod)
 *
 * Runs with --conditions=react-server: the settings resolver imports server-only.
 */
import "./public-db-url";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { resolveRazorpayAccount } from "../src/lib/settings/config";
import { isRazorpayConfigured, razorpayRequest } from "../src/lib/payments/razorpay";
import { paymentsAllowed } from "../src/lib/payments/enabled";

let failures = 0;
let warnings = 0;
const pass = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d = "") => {
  failures += 1;
  console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ""}`);
};
const warn = (n: string, d = "") => {
  warnings += 1;
  console.log(`  WARN  ${n}${d ? `\n        ${d}` : ""}`);
};

/** One cheap authenticated read. Proves the key pair is live without creating anything. */
async function keysAccepted(keys: { keyId: string | null; keySecret: string | null }): Promise<string | null> {
  try {
    await razorpayRequest<{ count: number }>("GET", "/payments?count=1", keys);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function checkScope(label: string, tenantId: string | null): Promise<void> {
  console.log(`\n${label}`);

  const [gst, nonGst, allowed] = await Promise.all([
    resolveRazorpayAccount(tenantId, "GST"),
    resolveRazorpayAccount(tenantId, "NON_GST"),
    paymentsAllowed(tenantId),
  ]);

  const haveGst = isRazorpayConfigured(gst);
  const haveNonGst = isRazorpayConfigured(nonGst);

  if (!haveGst && !haveNonGst) {
    console.log("  SKIP  no Razorpay keys on either account (a tenant that collects no money)");
    return;
  }
  if (!allowed) {
    warn("payments are switched OFF for this scope", "Links cannot be generated or paid until the switch is on.");
  }

  for (const [name, keys, present] of [
    ["GST", gst, haveGst],
    ["Non-GST", nonGst, haveNonGst],
  ] as const) {
    if (!present) {
      console.log(`  SKIP  ${name} account not configured`);
      continue;
    }
    const err = await keysAccepted(keys);
    if (err) fail(`${name} keys rejected by Razorpay`, err);
    else pass(`${name} keys accepted by Razorpay (${keys.keyId})`);

    if (!keys.webhookSecret) {
      fail(
        `${name} account has no webhook secret`,
        "A payer who closes the tab on the way back would never be recorded. Add it in Settings.",
      );
    } else {
      pass(`${name} webhook secret present`);
    }
  }

  if (haveGst && haveNonGst && gst.keyId && gst.keyId === nonGst.keyId) {
    fail(
      "both accounts hold the SAME key id",
      "One of them is a copy-paste mistake: the GST/Non-GST split in reporting would be fiction.",
    );
  } else if (haveGst && haveNonGst) {
    pass("the two accounts are genuinely different key ids");
  }
}

async function main() {
  console.log("verify:pay-links - payment links and the two Razorpay accounts\n");

  // The platform scope (the owner's own funnels) plus every tenant that has keys.
  await checkScope("PLATFORM / Apply Gita (singleton settings row)", null);

  const tenants = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
      setting: {
        OR: [{ razorpayKeyId: { not: null } }, { razorpayNonGstKeyId: { not: null } }],
      },
    },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
  for (const t of tenants) await checkScope(`TENANT ${t.name} (${t.slug})`, t.id);

  // Link inventory. Not a pass/fail - a picture of what has been sent.
  const [created, paid, cancelled, stale] = await Promise.all([
    prisma.paymentLink.count({ where: { status: "CREATED" } }),
    prisma.paymentLink.count({ where: { status: "PAID" } }),
    prisma.paymentLink.count({ where: { status: "CANCELLED" } }),
    prisma.paymentLink.count({
      where: { status: "CREATED", createdAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
    }),
  ]);
  const sales = await prisma.payment.aggregate({
    where: { purpose: "product_sale", status: "captured" },
    _count: { _all: true },
    _sum: { amount: true },
  });

  console.log("\nLINKS");
  console.log(`  ${created} awaiting payment, ${paid} paid, ${cancelled} withdrawn`);
  if (stale > 0) {
    warn(
      `${stale} link(s) unpaid for over 30 days`,
      "Harmless - a link has no expiry - but withdraw the ones that are no longer on offer.",
    );
  }
  console.log(
    `  product sales recorded: ${sales._count._all} totalling ₹${((sales._sum.amount ?? 0) / 100).toLocaleString("en-IN")}`,
  );

  // The one invariant worth asserting about money: a product sale must never have been
  // booked as a consultation unlock, or the funnel's conversion rate inherits it.
  const misfiled = await prisma.payment.count({
    where: { purpose: "assessment_unlock", notes: { path: ["paymentLinkId"], not: Prisma.DbNull } },
  });
  if (misfiled > 0) {
    fail(`${misfiled} payment-link sale(s) are filed as assessment_unlock`, "They would inflate funnel conversions.");
  } else {
    pass("no payment-link sale is filed as a funnel consultation");
  }

  console.log(`\n${failures} failure(s), ${warnings} warning(s)`);
  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

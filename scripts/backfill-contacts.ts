/**
 * Turn every existing submission and gate entry into a contact.
 *
 * A SCRIPT rather than SQL inside the migration, deliberately. A mobile only becomes a
 * contact's identity after toE164Digits has stripped its trunk zero and prepended the
 * tenant's dialling code. Reimplementing that in SQL would mean two normalisers, and
 * the day they disagree is the day one person becomes two contacts and gets every
 * broadcast twice.
 *
 * Safe to run repeatedly. It only creates contacts that do not exist and only fills
 * links that are still null, so a second run after more submissions arrive does the
 * remainder and nothing else. It never sets consent: nobody backfilled here saw a
 * consent line, and inventing one would be the only genuinely dishonest thing this
 * script could do.
 *
 *   npx tsx scripts/backfill-contacts.ts            (dry run, prints what it would do)
 *   npx tsx scripts/backfill-contacts.ts --apply    (writes)
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PLATFORM_TENANT_ID = "platform";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function token(length = 24): string {
  let id = "";
  for (const byte of randomBytes(length)) id += ALPHABET.charAt(byte & 31);
  return id;
}

/** The same rule as features/nurture/config.ts, copied rather than imported so this
 *  script does not drag the server-only module graph in. Keep the two in step. */
function toE164Digits(mobile: string | null | undefined, cc: string): string | null {
  if (!mobile) return null;
  const hadPlus = mobile.trim().startsWith("+");
  let d = mobile.replace(/[^\d]/g, "");
  if (!d) return null;
  const code = (cc || "").replace(/[^\d]/g, "");
  if (hadPlus) return d.length >= 8 ? d : null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (code && !(d.startsWith(code) && d.length >= code.length + 8)) d = code + d;
  return d.length >= 8 ? d : null;
}

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;
const cleanEmail = (v: string | null | undefined) => {
  const t = clean(v)?.toLowerCase() ?? null;
  return t && t.includes("@") ? t : null;
};

const ccCache = new Map<string, string>();
async function ccFor(tenantId: string): Promise<string> {
  const hit = ccCache.get(tenantId);
  if (hit) return hit;
  const s = await prisma.appSetting.findUnique({
    where: { tenantId },
    select: { wabaDefaultCountryCode: true },
  });
  const cc = s?.wabaDefaultCountryCode?.trim() || "91";
  ccCache.set(tenantId, cc);
  return cc;
}

interface Row {
  id: string;
  tenantId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  profession: string | null;
  createdAt: Date;
}

let created = 0;
let linked = 0;

async function resolve(row: Row, source: string): Promise<string | null> {
  const tenantId = row.tenantId ?? PLATFORM_TENANT_ID;
  const email = cleanEmail(row.email);
  const mobile = toE164Digits(clean(row.mobile), await ccFor(tenantId));
  if (!email && !mobile) return null;

  const found =
    (mobile
      ? await prisma.contact.findUnique({
          where: { tenantId_mobile: { tenantId, mobile } },
          select: { id: true },
        })
      : null) ??
    (email
      ? await prisma.contact.findUnique({
          where: { tenantId_email: { tenantId, email } },
          select: { id: true },
        })
      : null);
  if (found) return found.id;

  if (!APPLY) {
    created++;
    return null;
  }
  const c = await prisma.contact.create({
    data: {
      tenantId,
      mobile,
      email,
      firstName: clean(row.firstName),
      lastName: clean(row.lastName),
      profession: clean(row.profession),
      source,
      // The person existed from the moment they first opted in, not from the moment
      // this script ran, and every "added on" date in the product reads this column.
      createdAt: row.createdAt,
      lastSeenAt: row.createdAt,
      optOutToken: token(),
    },
    select: { id: true },
  });
  created++;
  return c.id;
}

async function main() {
  console.log(APPLY ? "Applying." : "Dry run. Pass --apply to write.");

  // Oldest first, so the contact's createdAt ends up being the first time this person
  // was ever seen rather than the most recent.
  const subs = await prisma.submission.findMany({
    where: { contactId: null },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      tenantId: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      startedAt: true,
    },
  });
  console.log(`submissions without a contact: ${subs.length}`);
  for (const s of subs) {
    const id = await resolve(
      {
        id: s.id,
        tenantId: s.tenantId,
        firstName: s.leadFirstName,
        lastName: s.leadLastName,
        email: s.leadEmail,
        mobile: s.leadMobile,
        profession: s.leadProfession,
        createdAt: s.startedAt,
      },
      "SUBMISSION",
    );
    if (id && APPLY) {
      await prisma.submission.update({ where: { id: s.id }, data: { contactId: id } });
      linked++;
    }
  }

  const gates = await prisma.gateEntry.findMany({
    where: { contactId: null, leadEmail: { not: null } },
    orderBy: { passedAt: "asc" },
    select: {
      id: true,
      tenantId: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadProfession: true,
      passedAt: true,
    },
  });
  console.log(`gate entries with a lead and no contact: ${gates.length}`);
  for (const g of gates) {
    const id = await resolve(
      {
        id: g.id,
        tenantId: g.tenantId,
        firstName: g.leadFirstName,
        lastName: g.leadLastName,
        email: g.leadEmail,
        mobile: null,
        profession: g.leadProfession,
        createdAt: g.passedAt,
      },
      "SPLIT_GATE",
    );
    if (id && APPLY) {
      await prisma.gateEntry.update({ where: { id: g.id }, data: { contactId: id } });
      linked++;
    }
  }

  console.log(`contacts ${APPLY ? "created" : "that would be created"}: ${created}`);
  console.log(`rows ${APPLY ? "linked" : "that would be linked"}: ${linked}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

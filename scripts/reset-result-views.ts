/**
 * Reset the "VSL loads (result shown)" counter for ONE submission, by result token.
 *
 *   railway run npx tsx scripts/reset-result-views.ts <resultToken>
 *
 * Why this exists: GET /api/r/:token used to increment that counter for every caller,
 * so anything that fetched a result link - a diagnostic curl, a mail provider's link
 * scanner, a crawler - was reported to the owner as a person having viewed the result.
 * The endpoint now ignores non-human callers, but rows already inflated stay inflated,
 * and the number is meant to answer "has anyone actually read this result", which a
 * wrong value answers badly.
 *
 * Clears resultFetchedAt as well as the count: "first fetched at" is equally untrue if
 * no person ever fetched it.
 *
 * Read-modify-write on a single row by unique token. Prints before and after, and
 * refuses rather than guesses when the token matches nothing.
 */
import "./public-db-url";
import { prisma } from "../src/lib/db/prisma";

async function main(): Promise<void> {
  const token = process.argv[2]?.trim();
  if (!token) {
    console.error("Usage: tsx scripts/reset-result-views.ts <resultToken>");
    process.exit(1);
  }

  const row = await prisma.submission.findUnique({
    where: { resultToken: token },
    select: {
      id: true,
      leadFirstName: true,
      leadLastName: true,
      resultFetchCount: true,
      resultFetchedAt: true,
    },
  });
  if (!row) {
    console.error(`No submission with result token ${token}.`);
    process.exit(1);
  }

  const who = [row.leadFirstName, row.leadLastName].filter(Boolean).join(" ") || row.id;
  console.log(`${who}: resultFetchCount=${row.resultFetchCount}, resultFetchedAt=${row.resultFetchedAt?.toISOString() ?? "null"}`);

  if (row.resultFetchCount === 0 && row.resultFetchedAt === null) {
    console.log("Already zero - nothing to do.");
    return;
  }

  await prisma.submission.update({
    where: { id: row.id },
    data: { resultFetchCount: 0, resultFetchedAt: null },
  });
  console.log(`${who}: reset to resultFetchCount=0, resultFetchedAt=null`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

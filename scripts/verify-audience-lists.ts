/**
 * Named audience lists verification.
 *
 * Two halves. The first is pure and always runs: the gate schema's treatment of
 * `listId`, which is the whole back-compatibility story - every gate saved before named
 * lists existed carries no listId at all, and must keep resolving to the tenant's
 * default rather than to nothing. The second needs a database and checks the two
 * invariants that cannot be expressed in a type: one default list per tenant, and no
 * assessment pointing its gate at another workspace's list.
 *
 * The cross-tenant check is the one that earns its place. A listId rides inside the
 * gate JSON, and that JSON travels - duplicated funnels, imported templates, files from
 * another install. The public resolver already refuses a foreign id, so a breach of
 * this invariant shows up as suggestions quietly falling back to the default and
 * nothing in a log anywhere.
 *
 *   npx tsx scripts/verify-audience-lists.ts
 */
import { audienceGateSchema, audienceListNameSchema, EMPTY_AUDIENCE_GATE } from "../src/features/assessment/schemas";
import { importedGate } from "../src/features/assessment/transfer/gate";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Named audience lists verification\n");

// --- The gate schema ----------------------------------------------------------
const legacy = audienceGateSchema.safeParse({
  mode: "FREETEXT",
  label: "What is your role",
  placeholder: "Type & Pick that best suits",
  freeTextRequired: true,
  roles: [],
});
expect("a gate saved before named lists still parses", legacy.success, legacy.success ? "" : legacy.error.message);
expect(
  "and names no list, so it resolves to the tenant's default",
  legacy.success && legacy.data.listId === "",
  legacy.success ? JSON.stringify(legacy.data.listId) : "",
);

const picked = audienceGateSchema.safeParse({ mode: "FREETEXT", listId: "abc123", roles: [] });
expect("a picked list is carried through", picked.success && picked.data.listId === "abc123");

expect("a new gate starts on the default list", EMPTY_AUDIENCE_GATE.listId === "");

expect("a list needs a name", !audienceListNameSchema.safeParse("   ").success);
expect("a name is trimmed", audienceListNameSchema.safeParse("  Clinic roles ").data === "Clinic roles");
expect("an overlong name is refused", !audienceListNameSchema.safeParse("x".repeat(61)).success);

// --- Import drops a foreign list ----------------------------------------------
const imported = importedGate({ mode: "FREETEXT", listId: "list_from_another_workspace", roles: [] });
expect(
  "an imported gate drops the exporter's list",
  (imported as { listId: string }).listId === "",
  JSON.stringify(imported),
);
expect(
  "and keeps everything else about the gate",
  (imported as { mode: string }).mode === "FREETEXT",
  JSON.stringify(imported),
);
expect("a gate that is null survives the trip", importedGate(null) === null);

// --- The database invariants ---------------------------------------------------
async function dbChecks() {
  if (!process.env.DATABASE_URL) {
    console.log("\n  SKIP  database invariants (no DATABASE_URL)");
    return;
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const lists = await prisma.audienceList.findMany({
      select: { id: true, tenantId: true, name: true, isDefault: true },
    });

    const defaults = new Map<string, number>();
    for (const l of lists) {
      if (l.isDefault) defaults.set(l.tenantId, (defaults.get(l.tenantId) ?? 0) + 1);
    }
    const tooMany = [...defaults.entries()].filter(([, n]) => n > 1);
    expect("at most one default list per tenant", tooMany.length === 0, tooMany.map(([t]) => t).join(", "));

    const withLists = new Set(lists.map((l) => l.tenantId));
    const noDefault = [...withLists].filter((t) => !defaults.has(t));
    expect(
      "every tenant that has lists has a default",
      noDefault.length === 0,
      `${noDefault.join(", ")} - gates naming no list fall back to nothing`,
    );

    const byId = new Map(lists.map((l) => [l.id, l.tenantId]));
    const assessments = await prisma.assessment.findMany({ select: { id: true, tenantId: true, audienceGate: true } });
    const foreign = assessments.filter((a) => {
      const g = a.audienceGate as { listId?: unknown } | null;
      const id = g && typeof g.listId === "string" ? g.listId.trim() : "";
      if (!id) return false;
      const owner = byId.get(id);
      return owner === undefined || owner !== a.tenantId;
    });
    expect(
      "no assessment points at a list it does not own",
      foreign.length === 0,
      foreign.map((a) => a.id).join(", "),
    );
  } finally {
    await prisma.$disconnect();
  }
}

dbChecks()
  .catch((e) => {
    failures += 1;
    console.log(`  FAIL  database invariants\n        ${e instanceof Error ? e.message : String(e)}`);
  })
  .then(() => {
    console.log(failures === 0 ? "\n🟢 All checks passed." : `\n🟡 ${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
  });

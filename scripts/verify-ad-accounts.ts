/**
 * verify:ad-accounts - the ad-account model's invariants, as checks rather than hopes.
 *
 * No database, no network, no env: the plan arithmetic is pure, and everything else here
 * is a SOURCE SCAN. The scan exists because the failures this phase fixed are all
 * invisible at runtime - an event sent to the wrong pixel returns 200, and a pixel saved
 * to a column nothing reads reports success - so the only moment they can be caught is
 * before they ship.
 *
 *   npm run verify:ad-accounts
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  PLAN_LIMITS,
  PARKED_LIMITS,
  UNLIMITED_LIMITS,
  planLimitsSchema,
} from "../src/lib/billing/plans";

const root = join(__dirname, "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8");

let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`🟢 ${name}`);
    return;
  }
  failed++;
  console.error(`🔴 ${name}${detail ? `\n   ${detail}` : ""}`);
}

// --- 1. The published ladder ------------------------------------------------
// These four numbers are on the pricing page. They are now ENFORCED
// (assertCanCreateAdAccount), so a drift here is a drift between price and product.
check("Gate includes 1 ad account", PLAN_LIMITS.GATE.adAccounts === 1);
check("Signal includes 2 ad accounts", PLAN_LIMITS.SIGNAL.adAccounts === 2);
check("Agency includes 10 ad accounts", PLAN_LIMITS.AGENCY.adAccounts === 10);
check("Enterprise includes 25 ad accounts", PLAN_LIMITS.ENTERPRISE.adAccounts === 25);
check("Every plan includes at least one", Object.values(PLAN_LIMITS).every((l) => l.adAccounts >= 1),
  "A plan with zero would make the Ad accounts screen unusable on a tier that is paying.");

// A parked tenant adds nothing; the platform is never capped.
check("Parked adds no ad accounts", PARKED_LIMITS.adAccounts === 0);
check("The platform scope is uncapped", UNLIMITED_LIMITS.adAccounts > 1000);

// Seats, the other limit that was published and enforced nowhere until this phase.
check("Seat ladder is 1 / 3 / 10 / 25",
  PLAN_LIMITS.GATE.seats === 1 && PLAN_LIMITS.SIGNAL.seats === 3 &&
  PLAN_LIMITS.AGENCY.seats === 10 && PLAN_LIMITS.ENTERPRISE.seats === 25);

// A snapshot frozen before ad accounts existed must still parse, or every customer
// rated before the column lands silently re-rates to the catalog.
const legacySnapshot = {
  responsesPerMonth: 1000,
  maxAssessments: 10,
  seats: 3,
  features: Object.fromEntries(Object.keys(PLAN_LIMITS.GATE.features).map((f) => [f, true])),
};
const parsedLegacy = planLimitsSchema.safeParse(legacySnapshot);
check("A pre-ad-account snapshot still parses", parsedLegacy.success && parsedLegacy.data.adAccounts === 1);

// --- 2. One source of truth for the pixel -----------------------------------
const config = read("src/lib/settings/config.ts");
const integrations = read("src/features/workspace/actions/integrations.ts");

check("resolveMetaConfig takes the assessment's ad account",
  /export async function resolveMetaConfig\([\s\S]{0,400}adAccountId/.test(config));

check("An unresolvable ad account reports NOWHERE, never the default",
  /if \(adAccountId\) return \{ pixelId: null, capiToken: null, datasetId: null \}/.test(config),
  "Falling through to the tenant default is the silent wrong-pixel failure the model exists to prevent.");

// 🔴 The regression guard for the bug this phase fixed: Settings used to write the
// legacy columns while the resolver read the AdAccount row, so saving a pixel did
// nothing and said it had worked.
check("Settings saves the pixel to the ad account, not the legacy column",
  /prisma\.adAccount\.(update|create)/.test(integrations) &&
  !/metaPixelId: pixelId/.test(integrations),
  "updateMetaSettings must write AdAccount. Writing metaPixelId is the silent no-op again.");

check("Settings reads the pixel from the same place the funnel does",
  /prisma\.adAccount\.findFirst/.test(integrations),
  "Reading the legacy column shows a tenant a value their funnel has stopped using.");

// --- 3. Nothing crosses a tenant boundary -----------------------------------
const assessmentActions = read("src/features/assessment/actions/assessment.ts");
check("A picked ad account is checked against the tenant that owns it",
  /sanitizeAdAccountId[\s\S]{0,600}prisma\.adAccount\.findFirst\(\{ where: \{ id: wanted, tenantId \}/.test(assessmentActions),
  "An id from another workspace would point this funnel at a stranger's pixel.");

const templateImport = read("src/features/templates/import.ts");
check("A template import carries no ad account",
  /data\.adAccount = undefined/.test(templateImport),
  "A template crosses tenants; an ad account id belongs to exactly one.");

// --- 4. The deferred fire resolves the same account -------------------------
const capiLog = read("src/lib/meta/capi-log.ts");
check("The CAPI log stamps which account an event went to",
  /adAccountId: ctx\.adAccountId/.test(capiLog));
check("A deferred fire prefers the row's own stamp",
  /log\.adAccountId \?\? sub\?\.assessment\?\.adAccountId \?\? null/.test(capiLog),
  "Resolving from the tenant alone re-fires a sale against whichever account is default.");

// --- 5. The senders cannot be called without an answer ----------------------
// The compiler enforces this; the check is here so a future "convenience default"
// shows up as a failed verify rather than as months of events on the wrong pixel.
const send = read("src/lib/meta/send.ts");
check("No CAPI sender defaults its ad account",
  !/adAccountId: string \| null = null/.test(send),
  "An optional ad account is why resolveMetaConfig supported this for weeks with zero callers.");

const publishLock = read("src/lib/meta/publish-lock.ts");
check("The publish lock checks the funnel's own account",
  /metaPublishBlock\(tenantId: string, adAccountId: string \| null\)/.test(publishLock),
  "Per-tenant, it clears a funnel whose chosen account has no token.");

console.log("");
if (failed > 0) {
  console.error(`🔴 ${failed} ad-account check(s) failed.`);
  process.exit(1);
}
console.log("🟢 ad accounts: ladder enforced, one source of truth, nothing crosses a tenant.");

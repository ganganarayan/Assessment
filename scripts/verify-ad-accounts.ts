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
check("Agency includes 5 ad accounts", PLAN_LIMITS.AGENCY.adAccounts === 5);
check("Enterprise includes 20 ad accounts", PLAN_LIMITS.ENTERPRISE.adAccounts === 20);

// 🔴 THE TWO NUMBERS THAT LOOK LIKE ONE. On Agency both are 5, on Enterprise both are
// 20, and they entitle completely different things: ad accounts this workspace runs
// itself, and separate client workspaces with their own logins. Asserted together here
// so that collapsing them into a single entitlement fails LOUDLY - with equal numbers,
// a merge would leave every individual assertion above still passing.
check("Ad accounts and client workspaces are separate entitlements",
  PLAN_LIMITS.AGENCY.adAccounts === PLAN_LIMITS.AGENCY.agencyTenants &&
  PLAN_LIMITS.ENTERPRISE.adAccounts === PLAN_LIMITS.ENTERPRISE.agencyTenants &&
  PLAN_LIMITS.SIGNAL.agencyTenants === 0 && PLAN_LIMITS.SIGNAL.adAccounts === 2,
  "Signal is the proof they are different: 2 ad accounts and zero client workspaces.");
check("Every plan includes at least one", Object.values(PLAN_LIMITS).every((l) => l.adAccounts >= 1),
  "A plan with zero would make the Ad accounts screen unusable on a tier that is paying.");

// A parked tenant adds nothing; the platform is never capped.
check("Parked adds no ad accounts", PARKED_LIMITS.adAccounts === 0);
check("The platform scope is uncapped", UNLIMITED_LIMITS.adAccounts > 1000);

// Seats, the other limit that was published and enforced nowhere until this phase.
//
// 🔴 A SEAT IS A USER INSIDE ONE WORKSPACE, never a workspace (owner, 2026-10-13). This
// asserted 1 / 3 / 10 / 25 for a day after that decision, failing red - and the obvious
// way to make it green was to edit the catalog back, which would have silently handed
// every Agency customer ten logins. A wrong self-check is more dangerous than no check.
check("Seat ladder is 1 / 3 / 1 / 1",
  PLAN_LIMITS.GATE.seats === 1 && PLAN_LIMITS.SIGNAL.seats === 3 &&
  PLAN_LIMITS.AGENCY.seats === 1 && PLAN_LIMITS.ENTERPRISE.seats === 1,
  "Agency and Enterprise buy WORKSPACES, each with its own login - not seats in one.");

// --- Custom domains, the wall that had no number until 2026-10-14 ------------
check("Every tier includes one custom domain",
  Object.values(PLAN_LIMITS).every((l) => l.customDomains === 1),
  "Gate's is withheld by the customDomain FEATURE, not by this count.");
check("Parked adds no custom domain", PARKED_LIMITS.customDomains === 0);
check("The platform scope is uncapped on domains", UNLIMITED_LIMITS.customDomains > 1000);

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

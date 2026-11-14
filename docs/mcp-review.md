# MCP review (Phase 1, read only)

Date: 14-11-2026. Branch read: staging (clean). Nothing in the app was changed.

## 1. What the app does

Assess360 is a multi-tenant lead qualification SaaS. A visitor lands on a public funnel
(/a/[slug]), passes or fails a qualification gate, opts in, answers a scored assessment and
lands on a result page. Gate rejections, opt-ins and completions are reported to Meta (pixel
plus Conversions API) so ads stop finding the wrong people. Workspaces (tenants) build funnels
from templates, see stats and leads, and connect their own ad account, domain, Razorpay,
email and WhatsApp.

Stack: Next.js 15 App Router, TypeScript strict, PostgreSQL via Prisma (about 85 models,
196 migrations), Better Auth, Cloudflare R2, Railway. Business logic lives in
src/lib and src/features/*/data, UI in src/app.

### Main tables (the ones an agent needs)

| Table | What it holds | Tenant column |
|---|---|---|
| Tenant | a workspace; id "platform" is the owner's own | - |
| User, Session | Better Auth logins; User carries tenantId and role | yes |
| ApiToken | hashed bearer tokens, one scope each | yes, nullable |
| Assessment | a funnel: gate config, status DRAFT/PUBLISHED, slug | yes, nullable |
| Category, Question, Option, ResultBand | funnel content | via Assessment |
| PageView | one row per page load (utm_*, fbclid, isBot) | yes |
| GateDisqualification | a visitor the gate turned away (repeat flag, exitKey) | yes |
| GateEntry | a visitor who passed the gate; split-mode leads live here | yes |
| Submission | the lead: name, email, mobile, scores, band, attribution, isPreview | yes |
| FunnelEventCount | daily count of events fired at Meta | yes |
| Template | the template library (built-in, private, contributed) | ownerTenantId |
| Contact | CRM contact | yes |
| AppSetting | one row per tenant of settings and encrypted keys | yes |

### Existing API routes (non-UI)

- /api/v1/meta-match, /api/v1/mentor, /api/v1/purchase-eventid: the **scoped bearer-token
  layer**. Each route calls authenticateApiToken(req, scope) in src/lib/api-auth/verify.ts.
- /api/w/stats/export, /api/w/submissions/export, /api/w/assessments/[id]: workspace exports,
  session-cookie auth.
- /api/admin/*: super-admin equivalents.
- /api/track, /api/r, /api/onward, /api/payments, /api/billing, /api/cron, /api/version and
  others serve the public funnel, payments, crons and deploy checks.

Everything else (builder, settings, stats screens) is Server Actions and server pages.

## 2. Login and workspaces

- **Humans** log in with Better Auth (cookie session). requireWorkspace() in
  src/lib/auth/guards.ts gives a /w page its tenantId; requireSuperAdmin() guards /admin.
- The super admin can **impersonate** a workspace through the acting cookie
  (src/lib/tenant/acting.ts). resolveActingScope() is the one answer to "who is acting".
- **Scope is a type** (src/lib/tenant/scope.ts): tenant, all, or the transitional unowned.
  whereScope(scope) is the Prisma fragment every read spreads. configTenantOf(scope) is the
  non-nullable tenant id every write stamps.
- **Machines** use ApiToken: plaintext shown once, sha256 stored, one scope per token,
  revocable, lastUsedAt stamped. Minted from /admin/api-tokens and /w/api. Tenants need the
  apiAccess plan feature (Agency) to mint.

### Is data fully isolated per workspace?

🟢 Mostly yes, by design. The pages and exports pass tenantOnly(tenantId) into the shared data
functions, and every funnel table above carries its own tenantId, so a scoped query never
needs a join to be safe.

🟡 Gaps, stated plainly:

1. **tenantId is still nullable everywhere.** Production was re-homed on 01-10-2026, but
   staging was never re-homed and still has platform rows with tenantId null. Isolation
   depends on every caller passing the right Scope, not on the database.
2. **Several data functions are unscoped by id**: getAssessmentById, getSubmissionResult,
   submissionsForGateLeads. Each caller adds the ownership check afterwards
   (for example /w/assessments/[id] compares a.tenantId). Any new caller, including MCP,
   must do the same or it is a cross-tenant leak.
3. **Defaults are ALL_TENANTS.** listAssessments, getAnalyticsStats, listSubmissions and
   friends default their scope to every tenant. Forgetting the argument leaks everything.
   MCP code must never rely on a default.
4. **Platform tokens read the wrong rows.** mintApiToken stamps the raw acting tenantId, which
   is null for the owner, and meta-match then filters tenantId: null. On prod, platform rows
   now carry "platform", so an owner-minted meta-match token sees only the few leftover
   unowned rows. Worth checking with the owner whether n8n still gets matches.
5. **Server actions read the session cookie.** importTemplate, withCapLock and every builder
   action call resolveActingScope() internally, so they cannot be called with a bearer token.
   The tenant-explicit cores underneath (importTemplateForTenant, assertCanCreateAssessment)
   can.

## 3. Reusable functions for agent tools

| Tool need | Reuse | Notes |
|---|---|---|
| auth | authenticateApiToken, hashApiToken, generateApiToken, API_TOKEN_SCOPES | add an "mcp" scope |
| list assessments | listAssessments(scope) in features/assessment/data.ts | always pass tenantOnly |
| funnel stats | getAnalyticsStats(range, scope, {assessmentId, floor}) | views, unique, qualified, disqualified by exit, opt-ins, completed, paid, Meta fires |
| by traffic source | getUtmBreakdown | page views only, grouped by utm_* |
| assessment lookup | getAssessmentForAnalytics(id, scope) | already scoped, returns null for foreign ids |
| leads | listSubmissions(take, scope, opts), listGateQualified | dates in IST via istDateRangeToUtc |
| lead detail | getSubmissionResult(id) | unscoped: must add tenant check |
| templates | listTemplatesForTenant(tenantId) | |
| create from template | importTemplateForTenant({templateId, tenantId, ...}) plus resolvePlan and assertCanCreateAssessment | the server action wrapper is cookie-bound |
| dates for humans | formatIST in src/lib/date.ts | DD-MM-YYYY HH:MM |
| plan/feature gates | tenantCan(tenantId, "apiAccess"), resolvePlan | |
| rate limit | rateLimit in src/lib/rate-limit.ts | used by meta-match |

## 4. Risky or broken things found

1. 🔴 **No ad id is stored.** There is no ad_id column or attribution key. ATTR_KEYS captures
   utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, gclid only. "Stats by
   ad id" is only possible if the ads put the Meta ad id into a utm parameter (usually
   utm_content={{ad.id}}). Which parameter carries it is an open question for the owner.
2. 🟡 **Meta-match platform token scope** (gap 4 above): possible silent zero matches on prod.
3. 🟡 **Stats count preview submissions.** getAnalyticsStats counts opt-ins and completions
   without filtering Submission.isPreview, so owner test runs inflate those two numbers.
   PageView does exclude bots. Not changing it (user-facing behaviour); MCP stats will match
   the Stats page and say so.
4. 🟡 **Unscoped-by-default data functions** (gaps 2 and 3): the biggest leak risk for any new
   caller, including this MCP work.
5. 🟡 **No test runner.** The repo has tsx verify scripts and a Playwright QA package but no
   unit test framework. Tests for the MCP will use Node's built-in node:test run through tsx,
   so no new test dependency.
6. 🟡 **No MCP SDK installed.** Adding @modelcontextprotocol/sdk is a new production
   dependency. Its HTTP transport targets Node req/res; the App Router hands us a web
   Request, so the adapter is a real piece of work (see the plan).
7. 🟢 Tenant columns on every funnel table, the Scope type and the token layer are solid
   foundations. Nothing found that blocks the build.

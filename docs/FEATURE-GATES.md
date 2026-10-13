# Feature gates - Gate · Signal · Agency · Enterprise

> Status: **Gate, Signal and Agency's real content are BUILT and enforced.** Ad accounts
> and seats closed on 2026-10-13 (§5). White-label stays off the page, because custom
> domain + badge removal together ARE white-label and both are Signal's. **Agency tenants
> (§8b) became real on 2026-10-13**: the catalog grants them, resolution derives them and
> the cap enforces them. Enterprise stays a sales motion: SSO, SLA and onboarding are
> stated as negotiated terms rather than shipped capabilities.
>
> **The unit changed with them.** Every workspace on the install - a tenant under the
> super admin, an agency admin's own, an agency tenant - is 1,000 responses, 10
> scorecards, 1 user, 1 ad account, 1 domain, 1 Razorpay. Agency is SIX of those for
> $249 (its own, free and uncounted, plus five), Enterprise twenty-one. Agency used to
> publish 5,000 responses and five ad accounts pooled in one workspace; nobody was ever
> charged for that shape, so the correction re-rated nobody.

## What already exists

`src/lib/billing/` is further along than a greenfield plan would assume:

| Piece | File | State |
|---|---|---|
| Plan catalog + limits | `plans.ts` | FREE / STARTER / GROWTH / SCALE |
| Resolution (plan → limits) | `plan-resolve.ts`, `entitlements.ts` | works |
| Enforcement | `gate.ts` | assessment hard cap, response capture-but-lock, feature gates |
| Prisma `Plan` enum | `schema.prisma` | FREE / STARTER / GROWTH / SCALE |

So this is a **re-tiering**, not new machinery. The risk sits in the enum migration and
two genuinely new concepts: the trial and the parked state.

---

## 1. Plan identities

| Old | New | Note |
|---|---|---|
| FREE | *(removed)* | existing FREE tenants must land somewhere, see below |
| STARTER | **GATE** | $39 / $32 annual |
| GROWTH | **SIGNAL** | $79 / $69 annual |
| SCALE | **AGENCY** | $249 / $219 annual *(repriced 2026-10-13, was $199 / $175)* |
| - | **ENTERPRISE** | from $599, custom |

Prisma enum change means a migration. Postgres cannot drop an enum value that is in use,
so: `ALTER TYPE "Plan" ADD VALUE` for the new names, backfill rows, leave the old values
orphaned in the type. Dropping them needs a full type swap and is not worth it.

🟢 **FREE is dropped outright, decided 2026-10-01.** There are no tenants on it, so the
migration has nobody to strand: no parked-FREE state, no grandfathering, no notice to
write. `FREE` stays in the Postgres enum as an orphan (see above) but leaves `PLAN_IDS`,
`PLAN_LIMITS` and every UI that lists plans.

🟢 **No customers exist, confirmed 2026-10-01.** One super admin and two tenants, all
owned by the platform owner. So the STARTER giveaway is a non-issue too, and with it the
entire grandfathering problem: there is no live customer funnel to protect, no plan
anybody paid for, and no notice to send.

That changes the build, not just the risk. The migration can set plans directly rather
than backfilling carefully; the re-tier does not need a compatibility window; and
mistakes here cost a re-run, not a customer. **This is the cheapest moment this change
will ever have**, every week of real signups makes it more expensive.

---

## 2. The two new concepts

### 2a. Trial

14 days of **Signal**, no card. Needs `trialEndsAt` (Subscription or Tenant) and
`resolvePlan` returning Signal entitlements while `now < trialEndsAt`.

At day 15 the account is **parked**, not downgraded. Downgrading to Gate is worse than it
sounds: their scorecards keep collecting on a plan they never chose, and the first thing
they notice is either a bill or a feature that silently stopped working.

### 2b. Parked (read-only)

A state the code does not have today:

| Surface | Parked behaviour | Built |
|---|---|---|
| Public funnel `/a/<slug>` | **Paused page**, not a 404, which would break live ad traffic and read as an outage | 🟢 `FunnelPaused`, 200 + noindex, `preview=1` exempt |
| New responses | Refused; nothing stored, nothing metered | 🟢 `startSubmission` + `completeSubmission` |
| Workspace `/w` | **Readable**, every submission, export and report still viewable | 🟢 via `readResponseLimit` |
| Edits / publish | Publish blocked; unpublish stays open | 🟢 `setAssessmentStatus` |
| Data | **Kept.** Parking never deletes | 🟢 nothing in the parked path writes or deletes |
| The tenant is told | Banner in the `/w` shell + the billing page header | 🟢 `BillingBanner` |

Two things the build changed from this design:

**It is not enforced in `requireWorkspace`, and must not be.** The workspace has to stay
fully readable while parked, so a guard there would have had to allow everything it was
added to block. The intake is stopped at its own two entry points instead, which is also
the only place that can distinguish "parked" from "over cap".

**Parked needed one thing limits could not express: the READ limit.** `PARKED_LIMITS`
sets `responsesPerMonth: 0`, and `isResponseLocked` locks any stored `periodSeq` above
the limit, so reading the parked limit on the read path locks *every lead the tenant
ever captured*. `resolvePlan` therefore exposes `readResponseLimit`, frozen at the last
entitling plan (the lapsed subscription's snapshot, or the trial's allowance). Leads they
had earned stay readable; leads that were already over cap stay locked, so cancelling is
not a way to unlock overage for free.

---

## 3. Feature flags

**Already in `FEATURES`:** `pdfReports`, `webhooks`, `leadExport`, `customDomain`,
`brandingRemoved`, `analyticsTracking`, `staffRoles`, `apiAccess`, `aiReports`,
`prioritySupport`, `qualificationGate`, `conditionalRouting`, `capi`, `heatmap`,
`conditionalExit` (added 2026-10-11).

**New flags this pricing needs:**

| Flag | Meaning | First tier |
|---|---|---|
| `exclusionAudiences` | disqualified feed a Meta exclusion audience | Gate |
| `qualifiedOnlyEvent` | the qualified-only optimisation event | Gate |
| `matchKeys` | first-party match keys on CAPI | Gate |
| `repeatLock` | back-button / repeat-submission lock | Gate |
| `manualReview` | manual-review screening fields | Signal |
| ~~`subAccounts`~~ | 🔴 NOT ADDED - no code exists; the page no longer claims it (2026-10-13) |
| ~~`sso`~~ | 🔴 NOT ADDED - a contractual term, quoted per Enterprise deal |

🟡 Several of these may already be unconditional behaviour (repeat lock, match keys).
Each needs checking first, adding a gate to something that currently runs for everyone
is how you silently break working funnels.

---

## 4. The gates, tier by tier

### GATE - $39

| Limit | Value | Mechanism |
|---|---|---|
| Scorecards | 2 | hard cap at create - `assertCanCreateAssessment` (exists) |
| Qualified responses | 150 / period | capture-but-lock (exists) |
| Users | 1 | hard cap at invite - `assertCanAddSeat` (built 2026-10-13) |
| Ad accounts | 1 | hard cap at create - `assertCanCreateAdAccount` (built 2026-10-13) |

**On:** `qualificationGate`, `capi`, `exclusionAudiences`, `qualifiedOnlyEvent`,
`matchKeys`, `conditionalRouting`, `pdfReports`, `webhooks`, `leadExport`, `repeatLock`,
`analyticsTracking`. Everything the differentiator depends on, which is the whole reason
Gate exists as a tier.

🔴 **This is a policy change, not a rename.** `qualificationGate` and
`conditionalRouting` are GROWTH+ today. Moving them to the entry tier means every current
STARTER tenant gains features on migration. Intended, but it is a giveaway, not a no-op.

**Off:** `customDomain`, `brandingRemoved`, `aiReports`, `heatmap`, `manualReview`,
`conditionalExit`, `subAccounts`, `apiAccess`, `sso`.

**Badge shown.** Needs a badge component on the public funnel and result page, hidden
when `brandingRemoved` is on. Does not exist yet.

### SIGNAL - $79

Everything in Gate, plus `customDomain`, `brandingRemoved`, `aiReports`, `heatmap`,
`manualReview`, `conditionalExit`.

`conditionalExit` ("conditional disqualifying route", added 2026-10-11) is more than one
exit from the page-1 gate: each route named, each with its own Meta event, plus the score
bands that decide who is waved through, who is flagged REVIEW and who is routed out. Gate
keeps the gate itself and its single exit - the mechanism that tier exists to demonstrate.
What Signal adds is TELLING REJECTIONS APART, which only starts to pay once somebody is
spending enough to care that their exclusion audience is clean. Enforced in
`features/assessment/actions/qualification.ts` (a second exit, an answer routed anywhere
but the first, or bands switched on).

| Limit | Value |
|---|---|
| Scorecards | 10 |
| Qualified responses | 1,000 |
| Users | 3 |
| Ad accounts | 2 |

🟢 `customDomain` is already gated through `tenantCan(tenantId, "customDomain")` in
`addDomain`, the one gate in this table that is already live and correct.

### AGENCY - $249 *(repriced 2026-10-13, was $199)*

Unlimited scorecards · 5,000 qualified responses · 10 users · 5 ad accounts ·
`apiAccess`, `bulkImport`.

**Why $249 with five accounts, not $199 with ten.** Ten included made the tier
underpriced: one Agency replaced roughly five Signal seats, which is $395 of value sold
for $199. Five stays well clear of Signal's two and leaves the heavy users somewhere to
pay. The price moved at the same time, so this is a repricing rather than a quiet
reduction in what the money buys.

🟢 **Nobody already paying is affected.** `resolvePlan` reads the frozen `limitsSnapshot`
on a subscription, so an existing Agency keeps ten accounts, and Razorpay keeps billing
them against the plan id they subscribed on. Grandfathering needed no code.

🟢 **Nothing to do in the environment.** `getOrCreatePlan` self-heals a price change into
a fresh Razorpay Plan: the cached Plan carries the cents it was created at, a price change
invalidates it, and the next checkout creates one at the new price using the Razorpay
credentials from Settings.

The one thing that could have defeated that was an env override, and on 2026-10-13 all six
`RAZORPAY_PLAN_ID_*` variables were DELETED FROM THE CODE. None had ever been set in any
environment - they were a pin for a dashboard-made Plan nobody made - but an override is
read ahead of the price, so one set variable would have meant a $249 page charging $199
with nothing anywhere disagreeing. Env launches the app; the price has one source
(`PLAN_PRICE_USD`) and the credentials have one home (Settings).

`railway run npm run verify:payments` remains worth running per environment: it now checks
the CACHED Plan against the catalog, which is what a price change actually touches.

🟢 Every line above is now enforced in code. What the tier sells is volume, ten SEPARATE
ad accounts (§5), bulk import, and scoped API tokens.

🟢 **Agency tenants are built** (2026-10-13, §8b). 🔴 **White-label is still not sold**:
it was Signal's custom domain and badge removal offered back at a higher price.

🟡 One dependency is NOT solved by that build: an agency tenant may have a custom domain
(the capability is on, so an agency can choose per client), but Railway caps custom
domains per service and we hit it at three. Beyond that, Cloudflare for SaaS has to be
awake - four variables and the Worker, see docs/CUSTOM-DOMAINS.md. `GET /api/version`
now reports `provisioning.saasArmed` so that state can be read instead of guessed.

🟡 **Extra ad accounts read "on request", not "$15 each".** The add-on needs an additive
purchased counter and, more to the point, no real subscription has been put through this
app yet. A comped extra account works today via `limitOverrides.adAccounts`.

### ENTERPRISE, from $599 *(sketch only; repriced from $499 on 2026-10-13)*

Custom everything, `sso`, SLA. Less a plan row than a sales motion, limits come from the
per-tenant override `resolvePlan` already supports.

---

## 5. Ad accounts - BUILT 2026-10-13

🟢 Shipped end to end. The model and the resolver landed on 2026-10-09; this is the rest
of it, and the published ad-account ladder (now 1 / 2 / 5 / 25) describes the product.

| Piece | Where |
|---|---|
| Model + per-assessment column + backfill | `AdAccount`, `Assessment.adAccountId`, migration `20261009160000_ad_account` |
| One resolver, one precedence | `resolveMetaConfig(tenantId, adAccountId)` in `settings/config.ts` |
| Screens | `/w/ad-accounts`, `/admin/ad-accounts`, `features/admin/actions/ad-account.ts` |
| Picker | builder step 11, Meta tracking |
| Cap | `assertCanCreateAdAccount` in `gate.ts` |
| Checks | `npm run verify:ad-accounts` |

**Four things it had to fix beyond the obvious, each of them silent:**

1. 🔴 **Settings wrote a column nothing read.** The backfill moved every tenant's pixel
   into an `AdAccount` row and the resolver began preferring the row, while
   `updateMetaSettings` kept writing `metaPixelId`. For a backfilled tenant, saving a
   pixel changed nothing and reported success. It now writes the default account and
   clears the legacy columns, so there is one source of truth from the first save.
2. 🔴 **The resolver's ad-account argument was optional, so nobody passed it.** The
   parameter existed from the day the model landed and every event in the app still went
   to the tenant default. It is now REQUIRED on every sender, `null` meaning "the default"
   as a deliberate answer. The compiler found all nine call sites in one pass.
3. 🔴 **The publish lock was per tenant.** A funnel pointed at a second account published
   on the strength of the first one's credentials and then reported nothing - the exact
   failure the lock exists to prevent, reintroduced by the feature. It now resolves the
   assessment's own account.
4. 🔴 **A deferred fire had no account.** `capi_log` rows are fired minutes or days later
   by the auto path or by hand, resolving from the tenant alone - so a sale captured on
   one account was re-fired against another. Rows now carry `adAccountId`
   (migration `20261013090000_capi_log_ad_account`) and prefer their own stamp.

**Seats came with it.** "1 / 3 / 10 users" was published and enforced nowhere either;
`assertCanAddSeat` closes it at `createStaff`. 🔴 It counts ACTIVE users only - the usage
meter counted soft-deleted rows, so gating on that number would have refused seats a
tenant had genuinely freed by removing staff.

🟡 **Still open:** quantity-based overage ($15 per extra account) needs an additive
purchased counter, which is billing rather than gating - see §8a. A manual grant works
today through the existing per-tenant `limitOverrides.adAccounts`.

---

## 6. Qualified-response metering

The headline promise - *disqualified visitors do not count* - **is already true**, and not
by luck: a disqualifying answer stores no lead, no submission and no result, so there is
nothing for `meterResponse` to count.

The change is therefore naming, not logic: `responsesPerMonth` →
`qualifiedResponsesPerMonth`, and the in-app meters should say "qualified responses" so
the promise is visible exactly where someone checks their usage.

Overage ($15 per extra 500) is a **billing** change rather than a gate: the cap stops
being a wall and becomes a threshold that bills. Capture-but-lock stays as the backstop
for tenants with no payment method on file.

🔴 Until that exists the page must not promise it, and as of 2026-10-13 it does not. The
old note read "Overage: $15 per extra 500 qualified responses", which no code charged -
going over runs capture-but-lock. A buyer told their overflow costs $15 would have found
out otherwise on the day their campaign over-performed. The note now says what happens:
answers are captured, the leads unlock when the plan is raised, nothing is lost.

---

## 7. Build order

1. 🟢 Plan enum + limits re-tier; resolve existing FREE tenants *(decided: no FREE tenants existed)*
2. 🟢 New feature flags, each checked against current unconditional behaviour
3. 🟢 Trial + parked read-only, including the trial countdown, the paused page and `readResponseLimit`
4. 🟢 Badge component (Gate)
5. 🟢 `AdAccount` model + per-tenant limit + UI + picker - §5 *(built 2026-10-13)*
6. 🔴 Qualified-response naming + overage billing
7. 🟡 Agency tenants - §8b. Catalog, resolution and cap *(built 2026-10-13)*; the create
   and enter surface, and the $29 slot purchase, are the phases after it.

Steps 1, 4 cover Gate and Signal end to end. 5 and 6 are needed before the published
pricing page is fully true. 7 is a feature build, not a gate.

### Checks

- `npm run verify:billing`, pure: the catalog, the tier ladder, trial day-math, parked limits
- `npm run verify:payments`, read-only pre-flight: keys, webhook secret, and the amount the
  first subscriber would actually be charged (the cached Razorpay Plan, fetched and compared
  with the catalog; the env overrides that used to bypass this were deleted 2026-10-13)

🔴 Neither proves a payment works. Checkout, signature verification and the webhook
round-trip need one real subscription put through before ad spend points at a signup page.

---

## 8. Agency tier, deferred plan

> Parked on 2026-10-01: build when ads start. Nothing here is approved; it exists so the
> Gate/Signal work does not paint it into a corner.

### 8a. `AdAccount` - BUILT, see §5 for what shipped

Today a tenant has exactly one Meta configuration, living as columns on its `AppSetting`
row (pixel id, dataset id, encrypted CAPI token). "Two ad accounts" is not expressible,
so the Signal row on the pricing page is already ahead of the code.

```prisma
model AdAccount {
  id           String  @id @default(cuid())
  tenantId     String
  label        String            // "Acme - AU", what the agency calls it
  pixelId      String?
  datasetId    String?
  capiTokenEnc String?           // encrypted at rest, like every other secret
  isDefault    Boolean @default(false)
  // …timestamps, tenant relation, @@index([tenantId])
}
```

`Assessment` gains `adAccountId String?`, null meaning "the tenant's default", so every
existing assessment keeps working without a backfill.

**Migration path that avoids a flag day:** create one `AdAccount` per tenant from its
existing AppSetting columns, mark it default, and leave the columns in place reading
through a resolver. Settings keeps working during the transition; the columns are dropped
only once nothing reads them.

🔴 The resolver is where this goes wrong if rushed. Meta config is read on the hot path
(every pixel render, every CAPI send). Two sources of truth, the old columns and the new
table, will diverge, and the failure is silent: events fire against the wrong pixel and
nobody notices until an ad account reports numbers that make no sense. One accessor, used
everywhere, switched once.

**Metering:** 🟢 done - `adAccounts` is hard-capped at create by
`assertCanCreateAdAccount`. 🔴 Overage is NOT: quantity-based billing ($15 each beyond the
plan) needs an ADDITIVE `adAccountsPurchased` on the subscription, because
`limitOverrides.adAccounts` REPLACES the plan value rather than adding to it. Deliberately
left for the pricing phase: no real subscription has been put through this app yet, and a
metered add-on is the worst possible thing to debut on. A comped extra account works today
by setting the override by hand.

### 8b. Agency tenants - BUILT 2026-10-13 (catalog, resolution, cap)

The real reason Agency is a tier rather than a bigger Signal. Vocabulary, set by the
owner and used in code as well as in conversation: **super admin** (the platform owner),
**tenant** (a workspace under the super admin), **agency admin** (the Agency customer who
resells), **agency tenant** (a workspace under an agency admin). Not "parent", not
"child", not "sub-account".

**The shape that shipped**, and why each piece is the cheap one:

- `Tenant.agencyAdminTenantId`, a nullable self-relation. Null = a tenant directly under
  the super admin, which is every pre-existing row, so there was no backfill. `ON DELETE
  RESTRICT`, because cascading from here would destroy several separate businesses when
  one agency account is deleted.
- **No `TenantMembership` table.** The app already had a mechanism for one person
  operating several workspaces: the acting-tenant cookie behind super-admin impersonation.
  So `enteredAgencyTenant` (src/lib/tenant/agency.ts) widens *who may read that cookie*
  to the agency admin above the named workspace, re-reading the link from the database on
  every request. A membership table would have been a second answer to a question the
  codebase had already answered, and every scope helper would have had to learn it.
- 🔴 **`impersonating` is NOT reused for it.** Across /w that flag means "skip the caps"
  (see the `assertCanCreateAssessment` call sites) - right for the platform owner, and a
  hole for an agency admin, who would have handed each agency tenant unlimited everything.
  An agency admin inside an agency tenant is reported as `viaAgency`, which no gate reads.
- **Entitlement is derived, one hop.** An agency tenant has no `Subscription` row and no
  Razorpay subscription: `resolvePlan` rates the agency admin's workspace and, if that
  plan still grants `agencyTenants > 0`, returns `AGENCY_TENANT_LIMITS`. Testing "has a
  subscription" instead would leave five workspaces alive on a $39 downgrade. A lapsed
  agency parks its agency tenants exactly as a lapsed tenant parks itself.
- **The agency tenant's own escape hatches win**, because they resolve first: the
  `unlimited` flag, then a manual grant on fall-through. That is the only way to lift one
  agency tenant, since `limitOverrides` needs a subscription to live on.
- **The cap is a count**, `assertCanCreateAgencyTenant`, shaped like
  `assertCanCreateAdAccount`: active agency tenants against `agencyTenants` +
  `Subscription.extraAgencyTenants`. The paid extras are only added while the plan still
  entitles reselling, or they would survive a cancellation on their own.
- **A trial creates one** (`TRIAL_AGENCY_TENANTS`), so the tier can be evaluated. 🟡 There
  is one trial and it grants Signal, so this reaches every trialing workspace.

**Still to build, in order:** the create/enter surface at /w/agency-tenants (including
creation reusing the platform's `createTenant` path, so the two cannot drift), the meter
on the agency admin's billing page, and the $29 slot purchase - a SECOND Razorpay
subscription carrying quantity, because quantity on the base plan multiplies $249 rather
than adding $29. `Subscription.razorpaySlotSubscriptionId` and `extraAgencyTenants` are
already in the schema for it.

🟡 White-label is bigger than removing a badge: emails, PDF reports, result pages, the
sender identity and any `assess360` string in a customer-visible surface. Audit the
surfaces before estimating - `brandingRemoved` today only hides a badge that does not yet
exist.

### 8c. API access

`apiAccess` is already a flag and `ApiToken` with scopes already exists (it feeds the
external Meta-match lookup). Agency work here is scope expansion and documentation rather
than new machinery, the smallest piece of this tier.

### 8d. Suggested order, when it starts

1. 🟢 `AdAccount` + resolver + migration from AppSetting columns *(done 2026-10-13)*
2. 🟢 `adAccounts` limit *(done)* · 🔴 purchased-quantity counter + $15 add-on *(pricing phase)*
3. `TenantMembership` + parent/child tenants
4. Agency workspace switcher
5. White-label audit, then white-label
6. API scopes + docs

Steps 1, 2 are self-contained and worth doing even if Agency never ships: multiple ad
accounts is useful to any tenant running more than one campaign.

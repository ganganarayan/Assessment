# Feature gates - Gate · Signal · Agency · Enterprise

> Status: **PLAN, not built.** Approved scope is **Gate + Signal**. Agency and Enterprise
> are sketched so the model does not have to be rebuilt later, several Agency features
> (sub-accounts, white-label) do not exist in the product at all yet.

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
| SCALE | **AGENCY** | $199 / $175 annual |
| - | **ENTERPRISE** | from $499, custom |

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
`prioritySupport`, `qualificationGate`, `conditionalRouting`, `capi`, `heatmap`.

**New flags this pricing needs:**

| Flag | Meaning | First tier |
|---|---|---|
| `exclusionAudiences` | disqualified feed a Meta exclusion audience | Gate |
| `qualifiedOnlyEvent` | the qualified-only optimisation event | Gate |
| `matchKeys` | first-party match keys on CAPI | Gate |
| `repeatLock` | back-button / repeat-submission lock | Gate |
| `manualReview` | manual-review screening fields | Signal |
| `subAccounts` | client sub-accounts + white-label | Agency |
| `sso` | SSO | Enterprise |

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
| Users | 1 | hard cap at invite (exists) |
| Ad accounts | 1 | **new limit, new concept** - §5 |

**On:** `qualificationGate`, `capi`, `exclusionAudiences`, `qualifiedOnlyEvent`,
`matchKeys`, `conditionalRouting`, `pdfReports`, `webhooks`, `leadExport`, `repeatLock`,
`analyticsTracking`. Everything the differentiator depends on, which is the whole reason
Gate exists as a tier.

🔴 **This is a policy change, not a rename.** `qualificationGate` and
`conditionalRouting` are GROWTH+ today. Moving them to the entry tier means every current
STARTER tenant gains features on migration. Intended, but it is a giveaway, not a no-op.

**Off:** `customDomain`, `brandingRemoved`, `aiReports`, `heatmap`, `manualReview`,
`subAccounts`, `apiAccess`, `sso`.

**Badge shown.** Needs a badge component on the public funnel and result page, hidden
when `brandingRemoved` is on. Does not exist yet.

### SIGNAL - $79

Everything in Gate, plus `customDomain`, `brandingRemoved`, `aiReports`, `heatmap`,
`manualReview`.

| Limit | Value |
|---|---|
| Scorecards | 10 |
| Qualified responses | 1,000 |
| Users | 3 |
| Ad accounts | 2 |

🟢 `customDomain` is already gated through `tenantCan(tenantId, "customDomain")` in
`addDomain`, the one gate in this table that is already live and correct.

### AGENCY - $199 *(deferred until ads start, see §8)*

Unlimited scorecards · 5,000 qualified responses · 10 users · 10 ad accounts with extras
at $15/mo · `subAccounts`, `apiAccess`.

**Sub-accounts and white-label do not exist.** That is a feature build; the gate is the
last 5% of it. Planned in full in §8.

### ENTERPRISE, from $499 *(sketch only)*

Custom everything, `sso`, SLA. Less a plan row than a sales motion, limits come from the
per-tenant override `resolvePlan` already supports.

---

## 5. Ad accounts, the one genuinely missing model

The pricing meters "ad accounts" and the app has **no such concept**. A tenant has one
Meta pixel/CAPI config in settings, full stop. Planned in §8; deferred until ads start.

🟡 Until it is built, the "ad accounts" row on the published pricing page describes
something the product does not have. That is a claim already in front of buyers, so it
is the first thing to build when Agency work begins, not the last.

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

---

## 7. Build order

1. 🟢 Plan enum + limits re-tier; resolve existing FREE tenants *(decided: no FREE tenants existed)*
2. 🟢 New feature flags, each checked against current unconditional behaviour
3. 🟢 Trial + parked read-only, including the trial countdown, the paused page and `readResponseLimit`
4. 🟢 Badge component (Gate)
5. 🔴 `AdAccount` model + per-tenant limit - §8a
6. 🔴 Qualified-response naming + overage billing
7. 🔴 Agency: sub-accounts / white-label, its own project

Steps 1, 4 cover Gate and Signal end to end. 5 and 6 are needed before the published
pricing page is fully true. 7 is a feature build, not a gate.

### Checks

- `npm run verify:billing`, pure: the catalog, the tier ladder, trial day-math, parked limits
- `npm run verify:payments`, read-only pre-flight: keys, webhook secret, and the amount the
  first subscriber would actually be charged (an env `RAZORPAY_PLAN_ID_*` override bypasses
  the self-healing price check, and this is what catches a stale one)

🔴 Neither proves a payment works. Checkout, signature verification and the webhook
round-trip need one real subscription put through before ad spend points at a signup page.

---

## 8. Agency tier, deferred plan

> Parked on 2026-10-01: build when ads start. Nothing here is approved; it exists so the
> Gate/Signal work does not paint it into a corner.

### 8a. `AdAccount`, build this first

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

**Metering:** `adAccounts` as a `PlanLimits` number, hard-capped at create. Overage is
quantity-based ($15 each beyond the plan), so it needs a per-tenant `adAccountsPurchased`
override that `resolvePlan` adds to the plan default, the same override mechanism
Enterprise uses.

### 8b. Sub-accounts and white-label

The larger build, and the real reason Agency is a tier rather than a bigger Signal.

**What an agency actually wants:** one login, many client workspaces, switch between them,
and the client never sees Assess360 branding. That is **not** today's tenant model, a
user belongs to exactly one tenant.

Two shapes:

1. **Parent/child tenants** - `Tenant.parentTenantId`. A child is an ordinary tenant in
   every other respect, so scoping, billing and domains all keep working unchanged. The
   agency's users get access to children through a membership table. 🟢 Reuses the entire
   existing tenancy model; the whole system already scopes by `tenantId`.
2. **A workspaces-within-a-tenant model**, a second hierarchy beneath Tenant. 🔴 Rejected:
   every scoped query in the app (`whereScope`) would need a second dimension, and that is
   a rewrite of the thing that currently keeps tenants apart. Not worth it.

Take (1). It also gives sub-account billing for free: a child tenant either rolls up to
the parent's subscription or carries its own, and `resolvePlan` already resolves per
tenant.

**The membership gap:** `User.tenantId` is a single column. Access to several tenants
needs a `TenantMembership` join (userId, tenantId, role) and `resolveActingScope` learning
to pick among them, which is close to what super-admin impersonation already does, except
scoped to an agency's own children rather than everything.

🟡 White-label is bigger than removing a badge: emails, PDF reports, result pages, the
sender identity and any `assess360` string in a customer-visible surface. Audit the
surfaces before estimating - `brandingRemoved` today only hides a badge that does not yet
exist.

### 8c. API access

`apiAccess` is already a flag and `ApiToken` with scopes already exists (it feeds the
external Meta-match lookup). Agency work here is scope expansion and documentation rather
than new machinery, the smallest piece of this tier.

### 8d. Suggested order, when it starts

1. `AdAccount` + resolver + migration from AppSetting columns *(unblocks the published
   pricing claim)*
2. `adAccounts` limit + purchased-quantity override + $15 add-on
3. `TenantMembership` + parent/child tenants
4. Agency workspace switcher
5. White-label audit, then white-label
6. API scopes + docs

Steps 1, 2 are self-contained and worth doing even if Agency never ships: multiple ad
accounts is useful to any tenant running more than one campaign.

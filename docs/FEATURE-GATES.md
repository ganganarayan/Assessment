# Feature gates — Gate · Signal · Agency · Enterprise

> Status: **PLAN, not built.** Approved scope is **Gate + Signal**. Agency and Enterprise
> are sketched so the model does not have to be rebuilt later — several Agency features
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
| FREE | *(removed)* | existing FREE tenants must land somewhere — see below |
| STARTER | **GATE** | $39 / $32 annual |
| GROWTH | **SIGNAL** | $79 / $69 annual |
| SCALE | **AGENCY** | $199 / $175 annual |
| — | **ENTERPRISE** | from $499, custom |

Prisma enum change means a migration. Postgres cannot drop an enum value that is in use,
so: `ALTER TYPE "Plan" ADD VALUE` for the new names, backfill rows, leave the old values
orphaned in the type. Dropping them needs a full type swap and is not worth it.

🔴 **FREE tenants are the hazard.** They signed up under a plan that will no longer
exist. Dropping them breaks live funnels; promoting them to Gate hands paid features away
for nothing. Proposal: move them to **parked read-only** with a dated notice — the same
state a lapsed trial lands in. This needs deciding before the migration runs, not after.

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

| Surface | Parked behaviour |
|---|---|
| Public funnel `/a/<slug>` | **Paused page** — not a 404, which would break live ad traffic and read as an outage |
| New responses | Refused; nothing stored, nothing metered |
| Workspace `/w` | **Readable** — every submission, export and report still viewable |
| Edits / publish | Blocked |
| Data | **Kept.** Parking never deletes |

Enforced in `requireWorkspace` and in the public funnel route. It reuses the shape of
`scopeEditDenied`, which already exists for view-only staff — same mechanism, different
reason.

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
Each needs checking first — adding a gate to something that currently runs for everyone
is how you silently break working funnels.

---

## 4. The gates, tier by tier

### GATE — $39

| Limit | Value | Mechanism |
|---|---|---|
| Scorecards | 2 | hard cap at create — `assertCanCreateAssessment` (exists) |
| Qualified responses | 150 / period | capture-but-lock (exists) |
| Users | 1 | hard cap at invite (exists) |
| Ad accounts | 1 | **new limit, new concept** — §5 |

**On:** `qualificationGate`, `capi`, `exclusionAudiences`, `qualifiedOnlyEvent`,
`matchKeys`, `conditionalRouting`, `pdfReports`, `webhooks`, `leadExport`, `repeatLock`,
`analyticsTracking`. Everything the differentiator depends on — which is the whole reason
Gate exists as a tier.

🔴 **This is a policy change, not a rename.** `qualificationGate` and
`conditionalRouting` are GROWTH+ today. Moving them to the entry tier means every current
STARTER tenant gains features on migration. Intended, but it is a giveaway, not a no-op.

**Off:** `customDomain`, `brandingRemoved`, `aiReports`, `heatmap`, `manualReview`,
`subAccounts`, `apiAccess`, `sso`.

**Badge shown.** Needs a badge component on the public funnel and result page, hidden
when `brandingRemoved` is on. Does not exist yet.

### SIGNAL — $79

Everything in Gate, plus `customDomain`, `brandingRemoved`, `aiReports`, `heatmap`,
`manualReview`.

| Limit | Value |
|---|---|
| Scorecards | 10 |
| Qualified responses | 1,000 |
| Users | 3 |
| Ad accounts | 2 |

🟢 `customDomain` is already gated through `tenantCan(tenantId, "customDomain")` in
`addDomain` — the one gate in this table that is already live and correct.

### AGENCY — $199 *(sketch only, not approved)*

Unlimited scorecards · 5,000 qualified responses · 10 users · 10 ad accounts with extras
at $15/mo · `subAccounts`, `apiAccess`.

**Sub-accounts and white-label do not exist.** That is a feature build; the gate is the
last 5% of it.

### ENTERPRISE — from $499 *(sketch only)*

Custom everything, `sso`, SLA. Less a plan row than a sales motion — limits come from the
per-tenant override `resolvePlan` already supports.

---

## 5. Ad accounts — the one genuinely missing model

The pricing meters "ad accounts" and the app has **no such concept**. A tenant has one
Meta pixel/CAPI config in settings, full stop.

1. **Count configured pixel/dataset ids** — cheapest, but "ad account" then means "pixel",
   which is not what a buyer reads it as.
2. **A real `AdAccount` model** per tenant (pixel id, dataset id, CAPI token, label), with
   assessments pointing at one. Correct, and it is what makes the $15 add-on sellable.

Option 2 is the honest one and a prerequisite for the Agency add-on revenue. Until it
exists the "ad accounts" row on the pricing page is aspirational — which matters, because
that page is already published.

---

## 6. Qualified-response metering

The headline promise — *disqualified visitors do not count* — **is already true**, and not
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

1. Plan enum + limits re-tier; resolve existing FREE tenants *(decide first)*
2. New feature flags, each checked against current unconditional behaviour
3. Trial + parked read-only
4. Badge component (Gate)
5. `AdAccount` model + per-tenant limit
6. Qualified-response naming + overage billing
7. Agency: sub-accounts / white-label — its own project

Steps 1–4 cover Gate and Signal end to end. 5 and 6 are needed before the published
pricing page is fully true. 7 is a feature build, not a gate.

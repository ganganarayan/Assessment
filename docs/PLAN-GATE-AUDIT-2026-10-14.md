# Plan gates, count walls, feature readiness, billing and onboarding gaps

> **Status, 2026-10-15.** Fixes 1, 2, 3, 5 and 6 from section 6 are DONE and on staging.
> Section 2's "custom domains: uncapped" row and section 3's manualReview finding are
> both closed; section 4's gaps 5 and 6 are closed. What section 2 says about the
> ad-account ladder is now out of date in one place: the owner set **Agency = 5 ad
> accounts AND 5 client workspaces, Enterprise = 20 and 20** (2026-10-14), two separate
> entitlements that happen to carry equal numbers. Still open: **4** (annual, a price
> nobody can pay), **7** (one real payment), the $5 extra-domain charge (the cap and the
> counter ship here, the checkout does not), and everything in section 5.
>
> Next pass, decided 2026-10-15: ONE checkout route taking a product CODE (never an
> amount, which a caller could forge) with a registry of purchasable items. It replaces
> two near-identical Razorpay plan creators, and makes both the $5 domain and annual
> billing one registry line each instead of a build.

Audit, 2026-10-14. Read from the code, not from the handovers.
Catalog: src/lib/billing/plans.ts · Enforcement: src/lib/billing/gate.ts ·
Resolution: src/lib/billing/plan-resolve.ts · Published claims: src/lib/marketing/content.ts

## 1. The gates that exist

Five count walls and one feature gate, all server-side, all skipping the platform scope
(isBusinessTenant) and any unlimited tenant.

| Gate | Shape | Enforced in |
| --- | --- | --- |
| assertCanCreateAssessment | Hard block at maxAssessments | 8 sites: /w/assessments, /w/assessments/new, /w/dashboard, /w/import, /w/templates, assessment.ts, import-text.ts, templates/library.ts |
| assertCanAddSeat | Hard block at seats, active users only (deletedAt null) | features/admin/actions/staff.ts |
| assertCanCreateAdAccount | Hard block at adAccounts | features/admin/actions/ad-account.ts (the settings write-through is deliberately unmetered) |
| assertCanCreateAgencyTenant | Hard block at included + paid extras, three named refusals (notReselling / nested / cap) | features/agency/actions.ts |
| meterResponse + isResponseLocked + responseLimitFor | Capture-but-lock: the answer is stored, the completion is stamped periodSeq, the fan-out is suppressed and the lead is unreadable above the cap | submission.ts (meter), /a/[slug]/r/[submissionId], /api/r/[token], /w/submissions, submissions-export.ts |
| tenantCan / assertFeature | Boolean per capability | 20 sites, listed in section 3 |

Read-path note: the lock compares against readResponseLimit, not the live limit, so a parked
tenant keeps every lead it ever captured readable. Deliberate, and correct.

## 2. The count wall against each plan

Catalog values. "Agency tenant" is a workspace under an agency admin (AGENCY_TENANT_LIMITS),
"Trial" is TRIAL_LIMITS, "Parked" is PARKED_LIMITS.

| Wall | Gate | Signal | Agency (own ws) | Enterprise (own ws) | Agency tenant | Trial | Parked |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Responses / period | 150 | 1,000 | 1,000 | 1,000 | 1,000 | 1,000 | 0 |
| Scorecards | 2 | 10 | 10 | 10 | 10 | 10 | 0 |
| Users (seats) | 1 | 3 | 1 | 1 | 1 | 3 | 1 |
| Ad accounts | 1 | 2 | 1 | 1 | 1 | 2 | 0 |
| Agency tenants | 0 | 0 | 5 (+$29 each) | 20 | 0 | 1 | 0 |
| Custom domains | off | **uncapped** | **uncapped** | **uncapped** | **uncapped** | **uncapped** | off |

🟢 The published matrix (PLAN_MATRIX) agrees with the catalog on all five enforced walls:
scorecards 2 / 10 / 10 / 10, responses 150 / 1,000 / 1,000 / negotiated, users 1 / 3 / 1 / 1,
ad accounts 1 / 2 / 1 / 1, workspaces 1 / 1 / 1+5 / 1+20. Enterprise "Negotiated" is the
limitOverrides path, which resolves ahead of the snapshot.

🟡 **Custom domains are the one wall with no number.** customDomain is a boolean feature;
PlanLimits has no customDomains field, and addDomain checks the feature and then nothing else.
The pricing page sells "each workspace: its own ad account, pixel and domain", singular, and an
agency tenant resolves customDomain true. So any Signal-or-above workspace, including a 14-day
trial, can add domains without limit, and each one consumes a Railway custom-domain slot
(capped at 3 per service) or a Cloudflare for SaaS custom hostname. That is the same scarce
resource the whole Cloudflare for SaaS build exists to ration.

## 3. Feature readiness

18 flags. Every one maps to a real capability; the question is whether anything withholds it.

### 🟢 Enforced server-side (12)

| Flag | Tier | Enforced in |
| --- | --- | --- |
| qualificationGate | every paid | qualification.ts (on activation only) |
| gateScoreBands | every paid | qualification.ts (only when bands are on) |
| conditionalRouting | every paid | routing.ts |
| capi | every paid | track.ts x2, capi-log.ts |
| analyticsTracking | every paid | submission.ts (completion event) |
| conditionalExit | Signal+ | qualification.ts (only when an answer routes); also covers the waitlist route and per-exit Meta events |
| customDomain | Signal+ | domains.ts (addDomain, plus canAdd for the UI) |
| brandingRemoved | Signal+ | /a/[slug]/page.tsx |
| aiReports | Signal+ | /w/ai page + lib/ai/generate.ts |
| heatmap | Signal+ | /a/[slug]/layout.tsx |
| bulkImport | Agency+ | /w/import page + transfer.ts |
| apiAccess | Agency+ | /w/api page + api-tokens/actions.ts |

Each paired gate is page plus action, so a direct server-action call cannot walk past hidden
UI. On domains only ADDING is gated: an existing domain keeps resolving after a lapse, which is
deliberate, since pulling it would be a customer outage rather than a downgrade.

### 🟢 True on every paid tier, so nothing to withhold (5)

pdfReports, webhooks, leadExport, staffRoles, prioritySupport. These sit in
PAID_BASE_FEATURES, so the only state where the flag differs is parked, and parked already
suppresses the fan-out through the response lock. leadExport is deliberately never gated: a
customer's own data must always come out. prioritySupport is informational by design.

### 🔴 Declared, differentiated, and enforced nowhere (1)

**manualReview.** PAID_BASE does not include it, Signal and up switch it on, and the pricing
matrix sells "Manual-review screening fields" as - / ✓ / ✓ / ✓. The only mention outside the
catalog is SIGNAL_CAPS in scripts/verify-billing.ts, which checks that the catalog grants it,
not that anything reads it. A Gate tenant can use free-text screening fields in full.
verify:billing still passes, because it audits the catalog against the pricing page, and on
that pair the two agree.

## 4. Billing gaps

| # | Gap | Severity |
| --- | --- | --- |
| 1 | **The refund policy promises a cancel button that does not exist.** /refund says "You can cancel at any time from your account" and "Cancel before the renewal date and you are not charged again". There is no cancel action, route or button: cancelRazorpaySubscription exists but is only called internally when swapping one subscription for another, and nothing in the app ever writes cancelAtPeriodEnd. A customer who wants out has to email. | 🔴 a published policy the product does not implement |
| 2 | **Annual pricing is advertised and unbuyable.** PLAN_PRICE_USD_ANNUAL and content.ts publish $32 / $69 / $219 per month billed yearly. Both Razorpay plan-creation paths hardcode period monthly, interval 1, and startSubscriptionCheckout takes only a plan id. There is no annual SKU and no toggle. | 🔴 a price nobody can pay |
| 3 | **Upgrade-only, by design, with no downgrade path.** PLAN_ORDER refuses same-tier and lower. Signal to Gate is support-only. | 🟡 |
| 4 | **No live payment has ever been taken.** verify:payments needs the deployed DB (railway run) and proves the Razorpay settings row is configured, not that a charge, a webhook and an activation have happened end to end once. | 🟡 known, still open |
| 5 | **verify:ad-accounts asserts the retired ladder and fails red.** It expects Agency 5 ad accounts, Enterprise 25, and seats 1 / 3 / 10 / 25. The 2026-10-13 one-workspace decision replaced all of that with 1 ad account and 1 seat per workspace, and the pricing page already matches the new numbers. Three failing checks on every run. The danger is not the noise: the obvious way to make them green is to edit the catalog back, which silently re-rates the Agency tier. | 🟡 a wrong self-check, not a wrong product |
| 6 | **Stale tier names in user-facing strings.** subscribe.ts: "Pick a paid plan (Starter, Growth, or Scale)". qualification.ts: "available on the Growth plan and up". Those plans do not exist. The qualificationGate message is also the one a PARKED tenant sees, where the truthful text is PARKED_MESSAGE. | 🟡 |

🟢 What is sound: the webhook is the source of truth for activation, renewal, past-due,
cancellation and completion; /verify only fast-paths the first activation; limits are frozen in
limitsSnapshot at purchase so a catalog change never re-rates a customer; the $29 slot extras
ride a second subscription (because quantity would multiply the base price), the webhook is the
only writer of the paid count, and a slot cannot be handed back below the workspaces in use.
verify:billing passes, 40-plus checks.

## 5. Self-onboarding: what is still pending

🟢 Working end to end: signup provisions a tenant, slug and 14-day Signal trial in the Better
Auth after-hook, stamps acquisition attribution, and sends the welcome mail (ZeptoMail HTTPS,
auto-routed from a zeptomail SMTP host, so Railway's blocked SMTP never matters). Trial welcome
modal, trial focus, support strip, trial-expired paused page, usage meters, self-serve upgrade
checkout, self-serve agency tenant creation plus slot purchase and removal, password reset
(native, with the CRM webhook as fallback), legal pages (privacy, terms, refund, shipping),
signups blocked on tenant domains.

Pending:

1. 🔴 **No in-app cancel.** Same as billing gap 1, and it is the one self-serve step a paying
   customer goes looking for. It is also what a subscription product is expected to offer.
2. 🟡 **Email verification is wired but inert.** emailVerification.sendOnSignUp is true, but
   sendVerificationEmail returns immediately unless EMAIL_VERIFY_WEBHOOK_URL is set, and
   requireEmailVerification is off. The comment beside it ("no mail system yet") is stale: the
   ZeptoMail HTTPS path exists and the welcome mail already uses it. So a typo'd or throwaway
   address gets a full trial and the clock starts anyway. Turning it on is a friction decision,
   not a build.
3. 🟡 **A trial can spend custom-hostname slots.** TRIAL_LIMITS grants customDomain and, with
   no count cap (section 2), a trialing workspace can add domains until Railway's
   3-per-service cap is hit. The Cloudflare for SaaS path that would absorb that is dormant.
4. 🟡 **No first-run checklist.** /w/onboarding is a support-ticket queue (ask us for help),
   not a guided "connect your pixel, build a scorecard, set the gate, add your domain". The
   welcome modal carries the first five logins; after that a self-serve tenant is on its own.
5. 🟡 **Nothing proves the paid path works.** Until one real card has moved through checkout,
   webhook, activation and meter reset, self-onboarding ends at a screen nobody has completed.

## 6. The fix list, in the order I would do it

| | Fix | Why | Size |
| --- | --- | --- | --- |
| 1 | In-app cancel: a confirm, cancel_at_cycle_end 1, write cancelAtPeriodEnd, show the end date. The webhook already handles the rest. | A published policy currently says something untrue. | small |
| 2 | Gate manualReview where free-text screening fields are saved, mirroring the qualification.ts pattern (gate on activation, not on edit). | A sold differentiator is free. | small |
| 3 | Add customDomains to PlanLimits (default 1, snapshot-safe default the way adAccounts got one) and enforce a count in addDomain. | Each uncapped domain spends a scarce, externally capped resource. | small-medium |
| 4 | Decide annual: build the annual SKU (a second Razorpay plan per tier, an interval argument through getOrCreatePlan, createSubscription and checkout, a toggle on the page) or pull the annual column until it exists. | A price nobody can pay. | medium, or minutes to unpublish |
| 5 | Correct verify:ad-accounts to the one-workspace ladder, and add a check that fails if anything raises Agency or Enterprise back above 1. | Stop the red, and stop the wrong fix. | small |
| 6 | Replace the two stale tier strings, and make the parked case say PARKED_MESSAGE. | Right now it reads as a billing bug to the person deciding whether to pay. | small |
| 7 | Run one real payment through staging, then production. | Everything above is theory until this happens once. | an afternoon |

Downgrade (billing gap 3) and the first-run checklist (onboarding 4) are deliberate product
calls rather than defects, and are left off this list until the owner wants them.

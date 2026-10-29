# Architecture

## Tenancy

Three levels, with two vocabularies that must not be merged.

| Internal name (code, schema, support) | Public name (anything a customer reads) |
|---|---|
| super admin | the platform owner |
| tenant | workspace |
| agency admin | an Agency or Enterprise customer who resells |
| agency tenant | **client workspace** |

"Sub-account" is wrong everywhere, internal and public. verify:billing fails if the word
reaches the pricing page. Never publish "plus N agency tenants": on Enterprise it reads as
twenty agencies each holding tenants of their own.

**The unit is ONE WORKSPACE** (owner, 13-10-2026): 1,000 responses/mo, 10 scorecards, 1 user,
1 ad account and pixel, 1 custom domain, 1 Razorpay account. A seat is a USER inside one
workspace, never a workspace. An agency tenant resolves to exactly `PLAN_LIMITS.SIGNAL`
through its parent, so every existing gate works unchanged.

### Two surfaces

- `/admin/*` uses `requireSuperAdmin`. This is also where super-admin IMPERSONATION lands:
  `enterTenant()` sets the acting cookie and redirects to /admin.
- `/w/*` uses `requireWorkspace`. Real tenant-admin logins, and honours the acting cookie.
- A per-tenant settings card added only to /w is invisible to the owner. Add it to both.
- A platform owner has NO workspace. With no tenant entered, /w bounces them to /platform.

### Scope is a type

`src/lib/tenant/scope.ts`: `{ kind: "tenant" | "all" | "unowned" }`. There is no "platform"
variant: the platform turned out to be data with a known id (`"platform"`, a literal so
`isPlatformTenant()` is a string compare, not a query on the billing hot path).

- `actingDataScope()` answers "which rows do I read".
- `configTenantOf(scope)` answers "which config row do I write" and returns a **non-nullable
  string**. That signature is the fix. Writes used to stamp `scope.tenantId`, which is null for
  an owner with no workspace entered, while reads resolved to the Platform tenant: an assessment
  created from /admin vanished the moment it was saved.
- `npm run verify:owner-stamp` is a DB-free source scan in the build chain that fails if any
  create stamps an owner from the nullable id. Delete it when the columns are NOT NULL.
- `src/features/assessment/actions/ownership.ts` (`assessmentInScope`) is the choke point every
  assessment-editing mutation goes through. A missed check is a cross-tenant IDOR.

### Settings addressing

One AppSetting row per tenant. `AppSetting.id` defaults to the literal `"singleton"`, so any
tenant-scoped upsert that omits an id collides with the platform row's primary key. Every
tenant upsert passes `tenantAppSettingId(tenantId)` from src/lib/settings/tenant-row.ts. The
platform row is reachable as either null or "platform" through `appSettingWhere`, which is what
stops a save creating a second row and splitting the live pixel and Razorpay keys across halves.

`safeDecrypt()` in src/lib/settings/config.ts means a corrupt encrypted secret falls back rather
than throwing. Any encrypted-secret read on a live path must be fail-soft.

### The re-home programme (still open)

Goal: move the owner's platform data out of `tenantId = null` into the Platform tenant, then make
`tenantId` NOT NULL, then re-point domains. The model fix shipped 30-09-2026 and the config
accessor is wired. **No data has moved in any environment.** The sequence:

```
npm run verify:tenancy -- --funnel apply-gita     # read-only, safe on prod
npm run settings:from-env [-- --apply]            # close the env gaps FIRST
npm run rehome -- --platform [--apply]            # owner + singleton AppSetting
npm run rehome -- --tenant apply-gita [--apply]   # the funnel data
npm run rehome -- --revert .rehome/<file>.json
```

NOT NULL is deliberately a LATER commit: migrate deploy runs in the start command, so the
constraint would land while old code is still writing explicit nulls on the funnel hot path.
To recover ONE orphan use scripts/adopt-assessment.ts, never `rehome --tenant platform` (the
sweep would drag every live funnel onto the Platform tenant).

## The public funnel

Order, resolved in src/features/assessment/flow/entry.ts:

`audience gate -> qualification gate -> lead form -> page-1 questions -> page-2 questions ->
pre-result details -> result`

- `leadCaptureAfter` moves the opt-in from the start to just before results.
- `leadCaptureMode = SPLIT` reverses audience and gate and spreads capture across screens:
  audience, name, gate, email, assessment, pre-result, phone. The lead lives on **GateEntry**
  at the email screen and becomes a Submission only at the phone screen. One cid joins them.
  Never add Qualified and Submissions together.
- The qualification gate scores the screening, the assessment scores the person. Gate answers are
  not Question/Option rows, so they live in `Submission.gateBreakdown` JSON.
- Named gate exits: `disqualifiedContent.exits[]` with modes PAGE (nothing stored), OPTIN (lead
  captured, exit page is the thank you), CONTINUE (the waitlist route, they opt in AND take the
  whole assessment). The KEY is stored, never the name.
- Per-answer outcome is ONE dropdown value: None / GateDisqualified / GateWaitlisted, derived by
  `optionOutcome(opt)` from the stored `disqualifies` + `exitKey` pair.
- Score bands: passMin / reviewMin / belowExitKey, evaluated server-side. The public payload
  ships no points or thresholds.
- Conditional routing is honoured only in SINGLE display mode, targets are forward-only, and an
  absent route row means linear NEXT. Option rule, then question default route, then linear.
- `QuestionType.FREE_TEXT` is excluded from scoring entirely, not scored 0.
- Endings (`NextStep`): RESULTS, DESTINATION, PAYMENT, NO_RESULT, plus the SIGNUP hand-off.
  Precedence in flow/stages.ts: SIGNUP > NO_RESULT > RESULT_PAGES > PAYMENT > DESTINATION.
- Two engines: GENERIC and CLINIC_AUDIT (a data-driven funnel-math engine where the builder sets
  a role per question and a number per option).

### Meta event model

Five events, each per-assessment toggleable via `Assessment.metaEvents`, under the
`fireMetaCapi` master switch.

| Moment | Event | Side |
|---|---|---|
| Gate rejected | GateDisqualified | CAPI only |
| Gate passed | GateQualified (was GatePassed) | default OFF |
| Opt-in submitted | CompleteRegistration | pixel + CAPI |
| Assessment finished | QualifiedCompletion or AssessmentCompleted | pixel + CAPI |
| Reached opt-in, left | AssessmentAbandoned | CAPI, 10 min grace |
| Passed gate, never reached the form | GateIncomplete | CAPI, default OFF |
| Paid | Purchase (or Purchase121 on the legacy funnel) | pixel + CAPI, event_id = Razorpay payment id |

`readMetaEvents` treats a MISSING key as ON so old funnels keep feeding live audiences. A brand
new event key must be added to `DEFAULT_OFF` in meta-events.ts or it starts firing from every
funnel on the platform.

## Result pages

Result pages are standalone **ResultPageDoc** records (kind RESULTS or VSL) bound 1:1 to an
assessment, enforced by unique columns on the assessment. Publishing writes `doc.published` then
MIRRORS onto the assessment columns the public still reads, so the live read path never moved.
Same page needed twice means Clone. Builder steps 12 and 13 BIND, they do not edit.

The VSL page is block based: eyebrow, headline, subhead, ai_statement, text, button, video,
testimonials, footer, with four theme presets (default dark_gold). A pasted video embed is never
rendered raw: `resolveVideoSource` extracts the src only, and handles YouTube, Vimeo, mp4 and HLS.

## Billing

- Tiers: Gate $39, Signal $79, Agency $249 (5 ad accounts and 5 client workspaces),
  Enterprise from $599 (20 and 20). 14-day Signal trial, then parked.
- `BillingTerm = MONTHLY | YEARLY`. `chargeUsd(plan, term)` is the one answer to what the card is
  charged; the annual figure is per MONTH and multiplied by 12. Monthly plan cache keys stay the
  bare tier name, yearly is suffixed `_YEARLY`.
- Parked and trial are expressed as LIMITS (`PARKED_LIMITS`), not a flag, so every existing gate
  reads them without a call site remembering. `readResponseLimit` is the separate frozen limit
  the READ paths use, so parking never hides past leads.
- Extras are ADDITIVE counters on Subscription (`extraAgencyTenants`, `extraCustomDomains`,
  and `adAccountsPurchased` is still owed) because `limitOverrides` REPLACES the plan value.
- Gates live in src/lib/billing/gate.ts: `assertCanAddSeat`, `assertCanCreateAdAccount`,
  `assertCanAddDomain`, `assertCanCreateAgencyTenant`, each counting ACTIVE rows only.
- Checkout never writes the entitlement before the money. What an open checkout is buying lives
  in `pendingPlan` / `pendingTerm`; the subscription it replaces in `priorRazorpaySubscriptionId`.
- Three payment lanes: platform billing (owner's Razorpay), tenant native Razorpay (their keys,
  their webhook host), and an external gateway hand-off (PaymentHandoff plus a cookie nonce).
  GST and non-GST are two accounts, and the non-GST one can never bill a subscription.

## Feature release switches

Deploying is not releasing. `FeatureRelease` rows plus a catalog in src/lib/features/catalog.ts,
resolved by src/lib/features/release.ts (not server-only, so crons can gate).

- ONE switch for ALL tenants, never per tenant. Platform and internal tenants (`Tenant.unlimited`)
  are exempt, so the owner tests as a tenant.
- Every catalog default is **false**: the same code runs on staging and prod, and only a DB row
  may say a feature is live. PROD HAS NO feature_release ROWS, so every key is held back there.
- Four choke points: nav hiding in /w/layout.tsx, `requireReleasedFeature` on the page,
  `featureDenied` in the feature's actions helper, and a skip-before-claim in both queue drains.
- Public respondent surfaces, contact creation and unsubscribe are never gated.
- A release flip is not a catch-up: stale queue rows are swept by due time.

## Integrations

- **Meta**: per-tenant pixel and CAPI token, resolved by `resolveMetaConfig` with the AdAccount
  row first, the tenant default second, and the legacy AppSetting columns only when the tenant
  has no ad account rows at all. `event_source_url` is forced at the choke point `withSourceUrl()`.
- **Razorpay**: stateless helpers, every function takes the tenant's keys. Per-tenant webhook at
  /api/payments/razorpay/[tenant], HMAC verified with that tenant's secret.
- **Email**: Railway blocks SMTP. `sendEmail` in src/lib/nurture/send.ts routes ZeptoMail hosts
  over their HTTPS API (api.zeptomail.in/v1.1/email, header `Zoho-enczapikey <token>`).
- **WhatsApp**: Meta Cloud API, approved templates only, plus coexistence (one number on both the
  Business app and the Cloud API). Built with Tech Provider self-serve onboarding.
- **R2**: two layers, the app upload bucket and the owner-driven Vault at /admin/vault.
- **Custom domains**: bring your own. Railway does routing and TLS and is the source of truth;
  we SHOW the DNS records for the client to add. `verified` means the Railway certificate is live.
  Railway caps domains per service (hit at 3), so Cloudflare for SaaS lifts it, armed in
  production only (`saasArmed` on /api/version).
- **VidaPulse**: the identity bridge. Assess360 mints the opaque XID; the result token (`?t=`) is
  the source of truth and rides every emitted URL alongside `r=` and `cid=`. Watch progress comes
  back by postMessage, kept as a map per session because VidaPulse counts per session.

# What has been built

Status key: 🟢 in production · 🟡 staging only · ⚪ designed and agreed, not built.

## Core engine

- 🟢 **Assessment builder, 13 steps.** Start from a template, Hero, Audience/profession,
  Qualification gate, Exit page, How questions are shown, Questions and categories, Lead form,
  Scoring and bands, After results, Tracking and rules, Results page, VSL result page.
  Mechanics in features/admin/components/builder-tab-context.tsx (BUILDER_TABS, STEP_KEYS,
  FORM_FIELD_STEPS).
- 🟢 Category builder, question builder, per-option custom scoring, per-question weights,
  result bands and per-category bands with meaning text.
- 🟢 Scoring engine, two engines: GENERIC and CLINIC_AUDIT (funnel math: enquiries, book rate,
  show-up, close rate, treatment value, ad spend, dormant, capacity, uplift).
- 🟢 Conditional routing: answer-based skip and jump, forward-only, SINGLE mode; default routes
  per question; FREE_TEXT questions.
- 🟢 Audience gate: DROPDOWN with per-choice cascade routing to another assessment, or FREETEXT
  with a type-ahead from the tenant's canonical list plus an /admin/audiences normalize screen.
- 🟢 Qualification gate: separate exit pages, named conditional exits (PAGE / OPTIN / CONTINUE),
  score bands with a REVIEW tag, gate-only funnels as a supported shape.
- 🟡 Gate outcome model rebuilt 24-10-2026: one dropdown per answer, waitlist as a reserved route
  with `neverExclude`, `showResultOfGate` default OFF and release-gated.
- 🟢 Split lead capture (name, gate, email, assessment, phone) in prod 17-10-2026, never walked
  end to end by a respondent, and the QA oracle still does not derive cases for it.
- 🟢 Retakes: policy ONCE / DELAYED / UNLIMITED, lockout, latest-only-per-person token resolution.
- 🟢 Result pages: standalone ResultPageDoc library, 1:1 binding, publish mirror, platform shelf
  to start from, any-video-player (mp4, YouTube, Vimeo, HLS).
- 🟢 PDF band report via react-pdf, per-band theme, "Add to PDF" note, plus a dedicated clinic report.

## Tenancy, platform and access

- 🟢 Multi-tenant isolation, /admin and /w surfaces, acting-tenant cookie impersonation.
- 🟢 Platform tenant as a real row, Scope as a type, configTenantOf wired, verify:owner-stamp
  in the build chain. The data move itself has NOT run anywhere.
- 🟢 Staff accounts VIEW / EDIT with canEdit enforced on every mutation, plus a seat cap.
- 🟢 Owner lockout recovery: /api/admin/recover (ADMIN_RECOVERY_SECRET) and
  scripts/reset-user-password.ts, plus a Prisma backstop that refuses to demote the owner.
- 🟡 Agency tenants: self-relation, provisionWorkspace as the one create path, /w/agency-tenants
  labelled "Client workspaces", $29 and $25 extra slots on a second Razorpay subscription.
- 🟢 Custom domains, bring your own, Railway routing and cert with the DNS records shown.
- 🟢 Cloudflare for SaaS, armed in production only. The Worker is now deployable from
  infra/wrangler.toml, but the live script stays the hand-pasted one until the first
  `npm run worker:deploy` actually runs.

## Billing and money

- 🟢 Razorpay subscriptions end to end, catalog as the single source of price, usage meters
  rendered, parked as a hard lock with billing and support exempt.
- 🟢 Annual term (27-10-2026): Subscription.term, chargeUsd, monthly usage windows inside the
  paid year, the charge read off the payment for the ledger and the Meta value.
- 🟢 In-app cancel at cycle end, with the exit survey offered AFTER the cancellation is booked.
- 🟢 Pay links: /pay/<token> where the client types the amount, GST and non-GST accounts,
  product_sale kept out of funnel stats.
- 🟢 Meta conversion pipeline: two payment record paths (return and webhook), CAPI with the
  Razorpay payment id as event_id, fbc rebuilt from the captured fbclid, a metaConversionAt
  stamp and a re-send recovery tool in Pixel Tester.
- 🔴 **No real payment has ever run in this app.** `verify:payments` proves configuration only.

## Marketing, SEO and distribution

- 🟢 Landing page with the Gate/Score/Signal mechanism hero, 13 comparison pages, 21 by-industry
  pages from a spec-per-audience registry, /answers knowledge base, wasted-call calculator,
  /pricing, /offers, /build intake, case-study and api-docs routes, legal pages.
- 🟢 One CTA source: three AppSetting fields edited on /platform drive every public button, with
  the UTM and click-id chain riding every link.
- 🟢 Currency: industry calculators open in INR inside India and USD outside, via cf-ipcountry.
  Plan and pricing pages are NOT currency switched.
- 🟢 Marketing claim audit 27-10-2026: the truth now lives in src/content/seo/capabilities.ts as
  two keyed maps, CAPS (what a customer can use today on a named plan) and LACKS.
- ⚪ Satellite static sites in D:/Claude Code/sites carry their own pixels and must tag every
  Assess360 CTA with the ecosystem UTM scheme.

## Templates

- 🟢 Template library: a dedicated Template table (never an Assessment with a flag), `body` IS
  the portable transfer shape, visibility DERIVED rather than stored, 22 repo-seeded built-ins,
  import / contribute / review, a Meta publish lock, and a per-row audit on /admin/templates.
- 🟢 One scoring convention across all built-ins: four bands 0-40 / 41-59 / 60-75 / 76-100,
  higher score means a higher reason to call, and the gate scores NOTHING.
- 🟢 Promote a platform funnel to the master library from /admin/assessment-builder, owner only,
  platform scope only.
- 🟢 b2b-saas is the only built-in carrying both result pages. The other 21 carry neither.

## Follow-up and messaging

- 🟢 Nurture: one-shot email and WhatsApp on completion, per tenant, best effort, logged, with a
  once-guard claimed atomically.
- 🟢 Support ticketing: one model two menus (tickets and onboarding), IN_APP / EMAIL / OFF per
  kind, replies POSTed to the owner's CRM webhook. This app sends no WhatsApp from support.
- 🟡 Contacts, tags, custom values (ContactField registry plus values, holdWhenEmpty defaults
  true so a message with a hole is skipped and logged).
- 🟡 Broadcasts, WA templates, WhatsApp coexistence dashboard. Coexistence itself is 🟢 in prod
  because one Meta app holds one webhook URL.
- 🟢 Workflows: visual builder (flow column plus properties panel, desktop only), triggers 1-30,
  actions 1-13, logs page, Zoom link step, CAPI step. Branching and loops are in the SCHEMA and
  deliberately never in the canvas.
- 🟡 Multi-trigger per workflow, contact created/updated triggers, custom values (28-10-2026).
- 🟡 Lifecycle engine: trial nurture planned daily per person by Sonnet, on the in-app heartbeat,
  with both switches off and the six WhatsApp templates not yet submitted to Meta.
- 🟢 Webhook delivery as a durable queue with lease claims and 2/5/15/30/60 minute backoff.
- 🟡 Appointment calendar: 1:1 booking at /b/<slug>, Schedule / Attended / NoShow CAPI, ics feed,
  plus automations (six triggers, email or approved WABA template).

## Analytics and operations

- 🟢 Stats, submissions, contacts, UTM breakdown, bot page-view attribution (bots recorded,
  excluded from stats, clubbed by source below the human rows).
- 🟢 Scoped API tokens plus three purpose-built v1 endpoints: meta-match, mentor,
  purchase-eventid/latest. This is not a general API and api-docs says so.
- 🟡 Vault: super-admin R2 file manager with immutable object keys, multipart browser uploads,
  lifecycle abort rules.
- 🟡 AI cost reconciliation: cost comes from the providers' own cost reports, never a rate table,
  and reconciles as billed = attributed + unattributed.
- 🟢 Onboarding sequence: one guided dialog mounted in the /w layout, resumed server-side, where
  checkable FACTS decide done rather than a journal row.
- 🟢 Trial funnel: blocking welcome modal for the first five logins (User.loginCount), support
  strip, TrialFocus panel, Trial expired panel, no sign-ups on a tenant's domain.
- 🟢 QA harness in qa/: cases DERIVED from a funnel with expectations from the app's own pure
  modules, plus `qa:screens` for the owner's screens (103 checks) and `qa:ui`.

## Still open

- The re-home data move, then `tenantId` NOT NULL, then the domain phase.
- 🔴 One real charge through Razorpay before pointing ads at signup.
- Unified checkout (one route, a product CODE never an amount, a registry of purchasables). This
  is what unblocks the declared-but-unpublished $5 extra domain.
- Quantity-based ad-account overage needs an additive `Subscription.adAccountsPurchased`.
- manualReview is sold as Signal+ and gated only where free-text screening fields are saved.
- The billing cards compute isUpgrade against a defaulted Gate, so a parked or trialling
  workspace sees Gate as "Current plan" while checkout would happily sell it to them.
- QA oracle coverage for SPLIT funnels. Split funnels are hand-walked until then.
- Respondent-facing cancel and reschedule links, per-staff calendars, Google Calendar OAuth.
- AI question generation does not exist and is marked Coming soon. Category WEIGHTS do not
  exist either; weighting is per question.
- Email verification is wired but inert, and there is no inbound mail ingestion.
- Prompt-based page builder inside Assess360 (block JSON validated by zod, never raw HTML).
- The AI workflow builder, which needs a structured-output path that does not exist yet.

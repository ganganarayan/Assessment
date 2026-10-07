# Handover: 2026-10-07 — Meta rework, workspace dashboard, and the Template Library build

Written so a fresh session can continue the **Template Library** without re-deriving anything.
Everything below either shipped today or is an agreed decision for the build that follows.

---

## 1. Where things stand

- **prod** = assess360.divineleads.guru, branch **main**
- **staging** = orbitq-assess.applygitawisdom.com, branch **staging**
- **Separate databases.** A result token that resolves on one 404s on the other. Verified today.
- As of the end of 2026-10-07, **staging and main hold the same work** and nothing is
  waiting to be pushed. Main is at **e12b7f5**; prod was serving the merge before it and
  was still deploying at the time of writing.

> 🟡 **A second Claude session works in this repo.** Two commits late on 2026-10-07
> (**c254442**, **958ddc5**) came from another chat, and that session also promoted to
> main. Always `git fetch` and check `origin/main..origin/staging` before assuming a
> push is yours to make, and read any commit you did not write before building on it.

Workflow is unchanged and non-negotiable: typecheck + `npx eslint .` (NOT `next lint`),
never a local build, commit and push to staging, verify `GET /api/version` matches the pushed
SHA on the staging URL, and only touch main when the owner says so explicitly. Migrations are
hand-written SQL folders applied by `prisma migrate deploy` at boot, so the version endpoint
reporting a new SHA is itself proof the migration applied.

---

## 2. The Meta event model, as it NOW is

This was rebuilt today. Do not trust older notes.

### One pixel per scope, one place each

| Scope | Columns | Set in |
|---|---|---|
| platform | platformPixelId / platformCapiTokenEnc | super-admin Settings, "App / subscription pixel" |
| tenant | metaPixelId / metaCapiTokenEnc | that tenant's Settings, Ads & payments |

`resolveMetaConfig(null)` **delegates** to `resolvePlatformMetaConfig()`, so the platform
cannot have two. The Meta fields were removed from the platform's "Ads & payments" card (now
titled "Payments (platform)"), which keeps Razorpay only.

**No env fallback anywhere.** NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN and
META_DATASET_ID are no longer read. Blank means silent, deliberately: a hidden variable
keeping a funnel alive is worse than a visible gap.

### Why that mattered

The platform had two pixel fields and one pixel, so the same id went in both. Two independent
senders then fired CompleteRegistration for the same person seconds apart with **different
event ids**, which Meta cannot deduplicate because they are not the same event. Every lead
counted twice: Ads Manager showed 10 results against 7 real opt-ins, and cost per result read
₹124 when the truth was ₹177. Diagnosed from the owner's own CAPI log, where the opt-in and
the SaaS signup rows matched on email **to the minute**.

### The ladder (all on the one pixel)

| Moment | Event | Notes |
|---|---|---|
| Gate rejected | GateDisqualified | CAPI only, no browser half |
| Opt-in submitted | CompleteRegistration | browser + CAPI, shared event id |
| Assessment finished | QualifiedCompletion (gated) / AssessmentCompleted | browser + CAPI |
| Reached opt-in form, left | AssessmentAbandoned | 10-minute grace |
| Passed gate, never reached form | GateIncomplete | **default OFF** |
| Workspace first opened | StartTrial | once per workspace, compare-and-swap claimed |
| Subscription paid | Purchase | Razorpay webhook + browser |

The sign-up page now reports **nothing**. That second CompleteRegistration was the duplicate.

### Traps that already bit, do not re-introduce

- `readMetaEvents` starts from ALL_META_EVENTS and must handle an explicit `true`. A
  DEFAULT_OFF key could not read back as on, so the GateIncomplete box saved correctly and
  always rendered unticked. The shape is now: an explicit boolean wins either way, and the
  missing-key rule applies only when there is no stored value.
- **assessment.ts has THREE save paths**: create (~line 167), update (~line 275) and duplicate
  (~line 445). A new column added to only one silently fails to persist. This caught
  autoAdvanceLastScreen and resultLinkShowsResult: the form posted, the action dropped it, the
  reload showed the old value.
- FunnelEventCount is an append-only tally keyed (assessment, event, IST day) with **no
  submission id**. Deleting a submission used to leave its events counted for ever; deletion
  now decrements via the CAPI log. CompleteRegistration has been counted since b096959.
- The manual Qualify / Disqualify / Started-trial buttons use a stable event id, so Meta
  collapses a repeat click. The stamp is written only on a successful send and checked before
  sending.

---

## 3. Other things that shipped today

- **Legal**: refund and terms describe the free 14-day Signal trial and the paused read-only
  state. "Payments are non-refundable" is stated as the rule, with billing errors in their own
  one-line section. Trial facts are imported from lib/billing/plans, never retyped.
- **/pricing** exists as a standalone page; the homepage #pricing anchor stays and the landing
  JSON-LD offers point at /pricing.
- **25 dead anchor links** on the five policy pages fixed at the source: LegalShell now passes
  anchorBase="/" to Nav and Footer.
- **Footer** no longer repeats the header; guides are grouped by `kind` (Guides / By industry /
  Comparisons) in a 6-column grid.
- **Gate result page**: `Submission.gateBreakdown` (JSON `[{q,a,points,max}]`) is written at
  answer time and rendered flat, no categories. A gate-only funnel finally shows its own result.
  The emailed token link renders it when `Assessment.resultLinkShowsResult` is on, decoupled
  from nextStep.
- **Abandon timing, and NO CRON**: the opt-in page sends a sendBeacon to
  /api/track/abandon, which only starts a 10-minute clock. The verdict is then taken by
  lib/events/abandon-scheduler.ts: a single in-process timer armed by the beacon, plus a
  once-a-minute nudge on ordinary funnel traffic that picks up anything a deploy
  dropped. **The owner explicitly does not want a cron** - more moving parts and manual
  work he has to remember. `scripts/sweep-abandoned.ts` and POST /api/cron/sweep-abandoned
  still exist and still work, but nothing depends on either being scheduled. Do not
  recommend scheduling one again.
- **Workspace Dashboard** at /w/dashboard is now where /w lands. The onboarding panel
  (video + owner-authored steps) sits **below the counts and the action links**, and is
  **NOT gated on the trial** - `trialing` is false for a paying customer, a manual grant,
  an internal workspace and a parked one, so gating on it meant the steps reached almost
  nobody and the owner saw an empty panel in his own workspace. Visibility is now simply
  whether any steps are authored: write them and it shows, clear every row and it hides.
  (Both corrections came from the other session, c254442 and 958ddc5.)
- **Result views** (resultFetchCount) only count non-bot callers now.
  `scripts/reset-result-views.ts` fixes a row that was already inflated.
- **Transfer fidelity**: export/import now carry per-category bands in JSON (a `bands` array on
  each category) and CSV (a CATEGORY_BAND row type). Omitted when empty so old files round-trip
  byte-identically. `npm run verify:transfer` compares exactly and will catch it if not.

---

## 4. THE TEMPLATE LIBRARY — the build that is next

### Why

A new tenant faces an empty builder, loses patience and never ships a funnel. Templates let
them import a working assessment and edit it.

### Design, decided with the owner

**Templates are rows in a dedicated `Template` table holding a JSON blob. They are NOT
Assessments.** Chosen over flagging assessments because a template-as-assessment leaks into
assessment lists, Stats, Submissions, dashboard counts and the sitemap, and worst of all
becomes **publicly reachable at /a/[slug] where it can collect real submissions**.

R2 was considered and rejected: every R2_* env var is optional, so a template library would
silently break wherever they are unset; a 20 KB JSON needs no object store; and a metadata row
is required either way. R2 stays right for PDFs and uploads.

The 8 built-ins ship as JSON files in the repo and are **seeded into the table**, so they stay
versioned in git and can be re-seeded after edits.

### Table shape (one migration)

What the list needs: title, slug, category ("Coaches", "Healers", ...), summary, the JSON body,
published flag, display order. For contributions: contributor tenant id, contributor name,
submitted at, review status, reviewed at.

### Behaviour

- **Super admin**: Templates under Assessments in the nav. Lists all templates with a publish
  checkbox per row. Contributions arrive here as **pending**, showing who sent them.
- **Tenant**: a Templates section on /w/dashboard, collapsible, **open by default, ABOVE the
  video**, with an Import button per row. Also a /w/templates page.
- **Import**: writes a real assessment into that tenant. Use `uniqueSlug()` from
  features/assessment/transfer/import.ts, which already guarantees a globally unique slug.
  Assessment.slug is unique platform-wide, so this is the owner's "slugs must never overlap"
  requirement, already solved. The copy is **DRAFT**, with **Meta events off**, and **counts
  against `assertCanCreateAssessment`**.
- **AI prompt**: a template carries suggested instructions. On import, **create an
  AiPromptVersion for that tenant** (per-tenant numbering continues past the built-ins) and
  select it on the assessment. No copy-paste for the tenant.
- **Save as template** in the builder: the tenant chooses to keep it **private to themselves**
  OR **contribute to the master library**.
- **Contribution reward**: approving can extend their credit period (the per-tenant
  access-until-a-date mechanism already exists). Cap is **one accepted contribution per
  workspace per calendar month: warn at approval, owner can override.**

### Policy line to add to /terms

> Rewards for accepted contributions are at the platform's sole discretion. They are granted as
> an extension of your credit period, never as a payment or refund, and are limited to one
> accepted contribution per workspace per calendar month.

### The 8 templates to author

Coaches, Healers, Astrologers, B2B SaaS, Agencies, Consultants, Clinics, Real estate.
Each one: **5 qualification-gate questions + 10 assessment questions.**

Across the set, cover all three shapes, each named for its purpose:
- gated with **no** assessment (screening only)
- gated **plus** assessment
- **ungated** plus assessment

with and without the AI statement.

### The publish lock (agreed, not yet built)

A tenant may not **publish** unless they have saved a Meta pixel id **and** a CAPI token, **or**
ticked a new per-tenant **"I don't use Meta"** override in the pixel section. Red warning text
naming what is missing, Publish button disabled, both clearing the moment the condition is met.

Enforce **server-side** in the publish action in features/assessment/actions/assessment.ts
(~line 338, beside the existing parked-tenant guard). The disabled button is only the visible
half; a disabled button is not a guard. Blocks publish only, never unpublish, mirroring the
parked rule.

### Suggested order

1. Template table + migration
2. Super-admin Templates screen with the publish checkbox
3. Tenant dashboard section + /w/templates + Import (unique slug, DRAFT, Meta off, plan limit, AI prompt)
4. Save as template / Contribute, with the pending-review flow
5. The 8 authored templates, seeded
6. The publish lock + the "I don't use Meta" override + the policy line

---

## 5. Still open, unrelated to templates

- `railway run npx tsx scripts/reset-result-views.ts LB636CXGA4B9K4CL` clears 3 views caused by
  diagnostic curls against a write endpoint.
- Delete NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN and META_DATASET_ID from Railway.
- ~~Schedule a cron~~ - removed by decision; the sweep is in-process now, see above.
- Paste the getting-started steps into super-admin Settings; the panel is empty until then.
- Nothing pending to promote as of end of 2026-10-07; re-check before assuming.

---

## 6. How the owner works

Blunt, fast, and right more often than not. He caught three wrong diagnoses today by checking
his own data, so lead with the verified fact, say plainly when something was my error, and
never offer a theory as though it were a finding.

He reads red and orange as danger, so status dots are 🟢 ok, 🟡 needs attention, 🔴 dangerous.
Inline code formatting renders red in his theme, so avoid backticks for branch names, paths and
commit hashes in prose; use bold or markdown links instead. No em dashes anywhere. Every reply
ends with a token footer.

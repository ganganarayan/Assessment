# Handover: 2026-10-08 (evening) — the builder split, the trial funnel, and what is next

Written so a fresh session can carry on without re-deriving anything. Everything here
is **live on production** at commit **921d3c2** unless it says otherwise.

Read alongside **docs/HANDOVER-2026-10-08-TEMPLATES-BUILT.md**, which covers the
Template Library itself. This document covers what was built after it.

---

## 1. Where things stand

- **prod** = assess360.divineleads.guru, branch **main**, at **921d3c2**
- **staging** = orbitq-assess.applygitawisdom.com, branch **staging**, at **a0692a2**
- Separate databases. Nothing is waiting to be promoted.

Workflow is unchanged: `npx tsc --noEmit` and `npx eslint .` (NOT `next lint`), never a
local build, commit and push to staging, verify `GET /api/version` matches the pushed
SHA, and only touch main when the owner says so. The version endpoint reporting a new
SHA is also the proof a migration applied.

> 🟡 **A second Claude session works in this repo.** Always `git fetch` and check
> `origin/main..origin/staging` before assuming a push is yours to make.

> 🟡 **Commit 8b6b370 does not build on its own.** A `git add` aborted on an
> already-deleted path and took the rest of the stage with it, so that commit carries
> only a file deletion and **195fac2** carries the rest. Harmless - Railway builds the
> branch head - and an attempt to squash them was correctly refused as a history
> rewrite. If it ever needs tidying that is a force-push the owner has to approve.

---

## 2. What shipped today, and the reasoning worth keeping

### The builder is thirteen steps

It was three tabs, and the first held everything: a 1,265-line settings form plus the
gate, the questions, both sets of bands and the destination connector in one column.

```
1. Start from a template     8. Lead form
2. Hero section              9. Scoring & bands
3. Audience / profession    10. After results
4. Qualification gate       11. Tracking & rules
5. Exit page (disqualified) 12. Results page
6. How questions are shown  13. VSL result page
7. Questions and categories
```

Mechanics, in **features/admin/components/builder-tab-context.tsx**:

- `BUILDER_TABS` is the list; `STEP_KEYS` is the subset the Back / Save & next walk
  covers (it stops before 12 and 13, which are separate builders with their own draft
  and Publish button). `STEP_HEADINGS` is what each step's card is titled.
- `BuilderStep` renders children only on its step. `BuilderStepNav` is the Back/Next row
  for the steps whose content is a page-level manager.
- `BuilderStepReset` puts you on step 1 when you open a different assessment.

In **assessment-form.tsx**: every top-level block is wrapped in a local `FormStep`.
`FORM_FIELD_STEPS` names the steps this form has fields on; on any other step the whole
form returns null, so the manager-only steps get their nav from the page instead.

> 🔴 **Hidden steps still save.** Every field of every step lives in one `values` object
> that is posted whole on every save. Do not "optimise" that into per-step payloads -
> moving on would start saving less than staying put.

> **Create mode shows the whole form.** `ShowWholeFormCtx` is true for `mode="create"`,
> because stepping before the row exists would offer the title and the slug and hide
> every other field behind steps that cannot be reached.

### Step 1 fills the assessment in place

`applyTemplateToAssessment` in **features/templates/actions/library.ts** lays a template
over THIS assessment. It refuses when the assessment already has categories, result
bands or gate questions, and points at the Templates page instead - which is why there
is no confirm dialog anywhere in it. Title and slug are kept.

### The trial funnel

- **TrialWelcomeModal** - blocking, on the first workspace screen after sign-in, for the
  first **5 logins** of a trialling tenant. The count is `User.loginCount`, stamped by
  the session-create hook in **lib/auth/auth.ts**. Dismissal is remembered in
  localStorage **against the login number**, so it reappears next sign-in and not on
  every navigation. A storage read that throws shows it: an extra appearance is a
  nuisance, a missed one loses the offer.
- **SupportStrip** - the same offer on every workspace screen while trialling.
- **TrialFocus** - the long version on /w/dashboard, above the counts.
- Neither the modal nor the strip appears while a super admin is operating a workspace.
- The paused panel says **"Trial expired"** when `resolved.status === null` and the
  trial end has passed, and "paused" when a subscription lapsed.

### No sign-ups on a tenant's own domain

`signupAllowedOnHost(host)` in **lib/tenant/signup-host.ts**, enforced in four places.

> 🔴 The one that matters is **/api/auth/\*/sign-up returning 403**. Middleware cannot
> cover it - the matcher excludes `/api` deliberately - which is also why the check takes
> a HOST rather than reading the headers middleware injects. The button and the page
> guard are decoration without it.

An **unknown** host still allows signup: localhost, previews and the Railway hostname
are hosts the Domain table has never heard of, and refusing there would lock signup out
of every environment that is not production.

🟡 **Never verified against a real tenant host.** The only tenant custom domain points
at prod, and faking a Host header does not work (`effectiveHost` needs the proxy
secret). Load assess.applygitawisdom.com now that this is live: Sign In alone, and
/sign-up should bounce to /sign-in.

### UI conventions now in force

- **Nav**: `components/nav-shell.tsx`, shared by /admin and /w. Named sections, one open
  at a time (the one holding the current path), ▶/▼ at the END of the title, whole
  column folds via « / » and the choice is remembered per app. Dashboard sits in its own
  "Overview" section above Build - it is where a tenant lands, not something they build.
- **Fields**: `--field-border`, `--field-border-hover`, `--field-bg` in globals.css.
  A standing border AND a lifted background, because a border alone on an identical
  background disappears whatever colour it is - the first attempt tinted `--primary` to
  45% alpha and was invisible on the dark theme. Amber while focused. An asterisk
  appears beside the label of the focused field via `div:focus-within > label::after`,
  which works because leaving a field is when autosave fires.
- **`color-scheme`** is declared on `:root` and `.dark`. Without it every native control
  - select lists, date pickers - renders light on a dark page.
- **Footer**: `components/app-footer.tsx`, support email and WhatsApp, every signed-in page.
- Contacts live in **lib/platform-support.ts**. Not env: an address that differs between
  environments is how a staging banner tells a real customer to write somewhere nobody reads.

---

## 3. The next feature: generate an assessment with AI

Agreed in principle, **not started, no code written**. It replaces the earlier
"download a prompt for your own AI" idea, which had three steps where things break.

**Cost is not the obstacle.** ~1-2k tokens in, 4-6k out per generation. On Haiku 4.5
that is roughly **₹0.5-1.5 a go**, so ₹2-5 per workspace even at three attempts. The
real risk is **abuse** - an endpoint that runs a model is one somebody can loop - which
needs a cap, not a bigger budget.

**Shape:**

- A second option on builder step 1, beside the templates: *describe your business and
  we write it*.
- Five or six specific questions, not a blank box: who they sell to, what they sell,
  what makes a lead worth a call, what disqualifies one instantly, what happens after
  the result.
- Output validated by **the same `templateDocSchema`** the library and importer use, so
  a malformed generation is rejected before it reaches the database and every existing
  rule (bands tiling 0-100, claimed shape matching the actual funnel) applies unchanged.
- Then it lands exactly like a template: fills the empty assessment, DRAFT, Meta off,
  AI instructions saved as a per-tenant prompt version. **Zero new write paths.**
- One automatic retry feeding the validation error back; models fix their own schema
  errors most of the time.
- Never auto-publish.

**Three decisions still open:**

1. Haiku fixed, or follow the tenant's configured model?
2. Cap at 5 generations per workspace per month, or tie it to plan tier?
3. Does the owner get a queue of unreviewed generations, or is the tenant's draft enough?

---

## 4. Open items

- 🟡 **The eight templates are on prod, unpublished and visible to nobody.** Review them
  from docs/ or the Download button on /admin/templates, then tick Published. That tick
  is the only thing that puts one in front of a tenant.
- 🟡 **The Apply Gita funnel still shows the free-text profession screen.** One change:
  builder step 3, switch the audience mode from Free field to Dropdown and leave the
  roles list empty. Profession returns to the lead form, where it is already ticked
  Required. The owner has been told where it is twice and has not flipped it - ask
  before doing it, it is a live funnel taking ad traffic.
- 🟡 **autoAdvanceLastScreen / resultLinkShowsResult are false on the PROD funnel**
  (paying-for-junk-leads). Not a bug: the row was last written 13 minutes before the fix
  commit existed, and nothing has saved it since. Proven working on staging, where both
  read true. It needs one successful save on prod.
- Two things offered and not taken up: a hard redirect to billing on trial expiry (the
  paused panel keeps them on the page with a Choose a plan button instead), and a strict
  focus trap on the welcome modal (it blocks clicks and scrolling; Tab can still reach
  behind it).
- Carried from the morning: paste the getting-started steps into super-admin Settings,
  and delete NEXT_PUBLIC_META_PIXEL_ID / META_CAPI_ACCESS_TOKEN / META_DATASET_ID from
  Railway.

---

## 5. Verification scripts worth knowing

```
npm run verify:templates     band ranges tile 0-100, claimed shape matches the funnel,
                             all three shapes and both AI variants covered, and that
                             omitting "disqualifies" still reads back a real boolean
npm run verify:json-repair   28 cases; ten exist only to prove the repairer never edits
                             the inside of a string
npm run seed:templates -- --public    re-seed against the deployed DB from a laptop
npm run templates:unpublish -- --public   take every built-in off the shelf
```

---

## 6. How the owner works

Blunt, fast, and right more often than not. He checks his own data, so lead with the
verified fact and say plainly when something was my error. Twice today he reported a
bug that the database showed was not one - both times the right move was to query prod
before theorising, and both times the answer changed the diagnosis completely.

Red and orange read as danger: 🟢 ok, 🟡 needs attention, 🔴 dangerous. Inline code
renders red in his theme, so avoid backticks for branch names, paths and commit hashes
in prose. No em dashes. Every reply ends with a token footer.

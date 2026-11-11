# qa - funnel verification against staging

A real browser walks a published funnel, case by case, and every case is judged against
what the funnel's own configuration says should happen.

Nobody writes the cases. You build a funnel in the admin UI - gates, exit routes, opt-in
before or after, conditional routing, bands - and the harness works out which runs would
prove it, drives them, and reports each one as expected or not.

This folder is deliberately outside the app: its own package.json, one dependency, and
excluded from the app's tsconfig and eslint. Railway never installs it and the Next build
never sees it.

## Setup, once

```bash
cd qa && npm install && npx playwright install chromium
```

Then either copy `.env.qa.example` to `.env.qa` and fill it in, or run the harness under
`railway run`, which injects the database URLs itself.

## The control panel

If you would rather click than type:

```bash
railway run npm run qa:ui
```

It opens a page on localhost with a button per step, the funnel list read from your
database, the output streaming as it runs, a link to the report, and a Windows balloon
when a sweep finishes. Each button also prints the command it is equivalent to, so the
terminal stays available and nothing here is a black box. A watched run floats the test
browser above your other windows while it drives, and drops it afterwards.

The panel refuses to drive anything that is not staging, and it only runs the jobs it
knows by name - it never takes a command from the page.

## What it does not cover yet

**Split lead capture.** A funnel whose Lead capture step is set to *Split across the
funnel* asks for the name before the gate, writes the lead at the email screen, and does
not create a submission until the phone screen. Every expectation in `oracle/expect.ts`
is built on the single-screen model, so the harness **refuses** such a funnel with a
message rather than deriving cases it would then judge against the wrong flow.

Walk those funnels by hand for now, and check the captured lead under **Gate qualified**
in the admin. Teaching the oracle the second order is its own piece of work.

## Running it

```bash
railway run npm run qa:all
```

Everything: the three fixtures, one after another, with a tally per funnel at the end
and a non-zero exit if any of them failed. Add `-- --also=my-funnel` to include yours,
or `-- --slugs=a,b` to sweep only what you name. Any other flag is handed to each sweep.

A note on the connection: everything here reads staging through Railway's public
Postgres proxy, which drops for a minute or two at a time - four times in one afternoon
while this was being built. Reads retry five times, backing off to half a minute, and a
case whose reads still fail is reported UNJUDGED rather than as a funnel failure. If a
whole run says it could not reach the database, that is the proxy, not the funnel: wait
and run it again.

```bash
npm run qa -- --slug=my-funnel --audit
```

What the funnel is, and whether driving it is safe. Nothing is driven.

```bash
npm run qa -- --slug=my-funnel --plan
```

The cases it would run and what it expects of each. Nothing is driven.

```bash
railway run npm run qa -- --slug=my-funnel
```

The sweep. One case at a time, about ten to twenty seconds each.

```bash
npm run qa -- --slug=my-funnel --headed --slow=250
```

The same thing in a visible browser, slowly, so you can watch it fill.

```bash
npm run qa -- --slug=my-funnel --case=gate-dq-abc-def --trace
```

One case, with a Playwright trace you can step through afterwards:
`npx playwright show-trace qa/reports/<run>/<case>.trace.zip`.

Other flags: `--only=gate,routes,bands,audience,edge,entry` to narrow the sweep,
`--desktop` for a desktop viewport instead of a phone, `--admin` to also read the run
back through the admin screens, `--force-live` to run anyway when the pre-flight finds a
live integration, `--i-know-this-is-prod` to point at a production host.

## What it checks, per case

Three sources, and absence is asserted as hard as presence.

**The screen** - which steps appeared and in what order, which exit route was shown with
its own heading, button and link, which questions were asked and which the routing
skipped, whether a required question stopped the run, the band and score on the result.

**The rows** - the submission and whether it reached COMPLETED, the lead fields, the gate
score, ceiling, band and exit key as stamped on the row, the GateEntry, whether the
opt-in was marked as seen, the GateDisqualification, and that nothing outbound was queued.

**The events** - FunnelEventCount read as a delta around each case. This works with no
pixel configured, because a failed send still counts: the question is what the funnel
decided to report, not what Meta received.

## Branching, both halves of it

An option rule fans a survey out; a question's DEFAULT route brings it back. The
generator makes a case for each: one that triggers the option rule, and one that reaches
the question and leaves it to its own rule - which is the only way a convergence is ever
proved. A FREE_TEXT question is answered by typing, scores nothing at all rather than
scoring zero, counts as answered where a required question is concerned, and the
sentence is read back off the submission row: collected but not stored is a failure.

## The loss that happens ten minutes later

Walking away from the opt-in fires nothing straight away. It starts a clock, because the
form asks for a WhatsApp number and the commonest reason to leave it is to go and fetch
that number. Ten minutes later a sweep decides which loss it was: AssessmentAbandoned for
somebody who saw the ask and refused it, GateIncomplete for somebody who never got that
far. Two audiences, and an ad written for one is wrong for the other.

The sweep asserts the near half immediately - the clock is running, nothing is reported
yet, and it names the verdict owed. The far half is a second command:

```bash
railway run npm run qa:abandon -- --slug=my-funnel --wait
```

It runs the app's own sweep function, then checks that what fired is what the funnel's
configuration says should have, and that every visitor that was due now carries a verdict
so none can fire twice. Without `--wait` it reports how long is left. Staging already runs
a cron that settles these, so it often finds nothing to do, which is the right answer and
it says so.

Two things to know. A lead-FIRST funnel produces no abandonment signal at all: the stamp
and the beacon both live on the dedicated opt-in step, which only a lead-after funnel has.
And the harness dispatches the page's own pagehide before leaving, because headless
Chromium drops a beacon sent while the page is being torn down - the funnel's own guard
means one beacon is sent, never two.

## Changing a case

The generated cases cover the funnel's own conditions, so most of the time there is
nothing to change. When there is, `qa/cases/<slug>.yaml` is yours. Write the first draft
with every generated case listed and commented out:

```bash
npm run qa -- --slug=my-funnel --write-cases --plan
```

Four things it can do:

- **skip** - case ids to leave out of the sweep
- **only** - run nothing but these ids
- **expect** - pin an expectation per case id (`exitKey`, `lead`, `submission`,
  `completed`, `gateEntry`, `disqualification`, `bandTitle`, `percent`, `terminal`,
  `events.fires`, `events.never`). A pinned expectation means that changing the funnel
  breaks the run instead of quietly changing what is expected, which is the point.
- **cases** - runs of answers you want driven every time. Answers can be option ids or
  the labels on screen, because nobody knows their own option ids:

```yaml
cases:
  - id: the-one-i-worry-about
    title: a founder who qualifies but will not start this month
    audienceRole: I am the right person
    gate:
      "When would you want this fixed?": "No timeline yet"
    behaviours: [reload-mid-flow]
    expect:
      completed: true
```

Anything in the file that does not resolve against the funnel is reported at the top of
the run rather than ignored.

The rows a sweep writes are left in place, because they are the evidence a failure is
argued from. Pass `--cleanup` to remove that run's own submissions, gate entries and
rejections afterwards.

## The screens that are not funnels

The newest work has no respondent to drive: a WhatsApp dashboard reading somebody else's
API, a provider dropdown that decides whether mail leaves at all, a contacts table
holding people who consented to nothing, and two policy pages a Meta reviewer opens. No
case can be derived for any of it, but each is still a screen that can be blank,
redirected, or confidently wrong.

```bash
npm run qa:screens
npm run qa:screens -- --only=legal,whatsapp
npm run qa:screens -- --headed --slow=250 --desktop
```

Five groups: `legal`, `email-providers`, `whatsapp`, `contacts`, `vault`. It signs in
once, reads, and writes the same HTML report as a sweep, with a full-page screenshot per
group. Nothing is written to the database or sent to Meta.

What it asserts is only what a browser can know:

- the screen answers, signed in, and is not a redirect to `/sign-in`
- the app's own error boundary did not render
- **every date a person reads is DD-MM-YYYY.** The test is sound rather than clever: in
  d-d-yyyy a second component above 12 cannot be a month, so the string must be
  month-first. That is the bare `toLocaleString()` this rule exists to catch, and on
  Railway it renders in US order. Ambiguous dates are left alone instead of guessed at.
- nothing leaked through the template: no `Invalid Date`, no `NaN`, no raw source enum
  where a described source belongs
- and where the contents ARE derivable, they match the app's own list: every provider in
  `lib/email/catalog` is in the dropdown, in the catalog's order, with the one transport
  Railway blocks offered last

`legal` runs with no credentials at all. The groups that need the owner's login skip
with the reason when `qa/.env.qa` has none.

### The login it uses

`npm run qa:admin` creates - or rotates - a dedicated staging login,
`qa-screens@qa.invalid`, whose password is generated by the script, written straight into
`qa/.env.qa` and printed nowhere. Running the pass therefore never requires knowing, or
handing round, the owner's own password:

```
BETTER_AUTH_SECRET=<any 16+ chars> BETTER_AUTH_URL=https://orbitq-assess.applygitawisdom.com \
  railway run npm run qa:admin
```

It writes one user row and one credential account, hashed with Better Auth's own hasher,
and deliberately NOT through `auth.api.signUpEmail`: that is the public signup path and
fires tenant provisioning, the welcome email and attribution. The account is inert, carries
`role = SUPER_ADMIN` so the `/admin` guard lets it through, and has its `loginCount` pushed
past the welcome-modal window - a blocking modal over the screen under test reads as every
check failing at once. The script refuses to run against anything but Railway's public
proxy host, because a local `DATABASE_URL` would create the account on the laptop and
report success while staging still had no such login.

### Three things the first real run disproved

- 🔴 **The sign-in form does nothing until React has hydrated.** It is a client component:
  before hydration the submit button has no handler, no request leaves the browser, and the
  page just sits on `/sign-in` - indistinguishable from a refused password. Staging serves
  that page in about ten seconds cold, which loses the race every time. The pass now waits
  for idle and then watches for the `/api/auth/sign-in` response itself, so "the form never
  asked" and "the server said no" arrive as different findings.
- 🔴 **The platform owner has no workspace of their own.** `/w` resolves an ACTING tenant,
  so an owner session with none entered is bounced back to the console, and a `/w` check
  would report a broken screen for a screen that was never asked for. The whatsapp group
  enters the first tenant from `/platform` (a cookie, nothing written), then clicks the
  product's own "Exit to platform" so the groups after it read the owner's scope again
  rather than one tenant's data.
- The provider dropdown is on **/admin/settings**, not `/admin/nurture`. Nurture is the
  messages; Settings holds the connection, which is what the page itself says.

🔴 **A fourth, which the per-check detail below caught in one line:** waiting for the
network to go quiet after clicking a server action is not waiting for the action.
`enterTenant` sets the impersonation cookie and then redirects, and
`waitForLoadState("networkidle")` can return the instant it is called, so the next
navigation aborted the action mid-request and the cookie was never written. Every `/w`
check then ran against the platform console - and passed, because `arrived()` only asked
whether the destination was not `/sign-in`. Both halves are fixed: entering and exiting
wait for the redirect each action performs and confirm the state from the product's own
"Acting as tenant" banner, and `arrived()` now asserts that the screen which answered is
the screen that was asked for.

### Both sides, and the one screen that must not have a second side

Settings, contacts and broadcasts are checked on `/admin` **and** on `/w`, inside an
entered tenant, because the tenant's copy is the one a customer actually looks at. The
vault is the exception and gets the opposite assertion: there is no `/w/vault`, because it
browses the platform's own R2 bucket where every tenant's files live, so what is checked is
that a workspace cannot reach it at all. It answers 404, and if it ever answers with a file
browser that is the most serious thing this pass can find.

**result.json now carries the detail**, not only the counts: the host it ran against, every
case, and every check with its expected and observed values. The counts stay exactly where
they were, so anything already reading them is unaffected. A red run can now be read
without opening the HTML, which is how the aborted-action bug above was found.

**Its other half is in the build.** The invariants that need no browser are asserted by
`scripts/verify-*.ts`, which the Railway build runs before `next build`, so a regression
fails the deploy rather than the screen: `verify:email-providers` (every provider
reaches its own region over HTTPS and refuses to send without a key),
`verify:whatsapp` (no `/register`, a good signup code is never thrown away, each sync can
only be spent once, a metric Meta did not report stays null), `verify:legal` (both policy
pages exist, every header link resolves, nothing company-specific is hardcoded),
`verify:contact-consent`, `verify:vault` and `verify:workflow-queue`.

## Tenancy: Phases 1 to 5 of the multi-tenant review, on the live app

```
railway run --service Assessment npm run qa:tenancy     # seed, run, clean up
npm run qa:tenancy -- --keep                             # leave the qa-tn- workspaces to look at
npm run qa:tenancy -- --cleanup                          # remove every qa-tn- row of every run
```

`verify:isolation`, `verify:lifecycle`, `verify:whitelabel` and `verify:region-roles` pin each fix in the source, in the build. A pin
proves the line is there, not that it works on the deployed app. This pass asks staging,
through the doors a person or an attacker would use (the sign-in form, the console's own
buttons, the public funnel URL, the public endpoints):

| Case | What it proves |
|---|---|
| p1-email-link | a forged or unsigned /e/c link goes home, a signed one is followed |
| p1-purchase-eventid | the public lookup returns a platform capture and never a business workspace's |
| p1-api-tokens | /w/api lists the workspace's own tokens and not another's |
| p1-razorpay-webhook | A's signed webhook settles A's lead, records nothing for B's, and the CAPI row is not pinned on B's lead |
| p2-signup | a mailinator signup is refused with a reason and leaves no login; a workspace named "Admin" gets admin-ws, linked to its login, on trial |
| p2-over-plan | three published funnels on a Gate grant: the two earliest serve, the newest shows the paused page, and /w/assessments says so |
| p3-brand | A's funnel carries A's primary colour, favicon, share image, "<funnel> · <A>" title and A's privacy and terms links; B (no policy pages) never gets the platform's /privacy or /terms |
| p3-report | A's admin gets A's PDF named <brand>_Report_<name>, never Assess360; B's admin gets 404 for it |
| p3-p4-settings | /w/settings carries the Brand and legal card and the Region card |
| p4-booking-zone | B is on America/New_York: its booking page labels times in that zone and every slot sits inside 09:00 to 17:00 New York, not IST |
| p4-pay-currency | a payment link made in B (USD) asks "Amount ($)", prefilled 19.99, no rupee sign |
| p5-view-staff | view-only staff: no Staff, Billing, API or Client workspaces in the menu (the owner's menu has them), a view-only note on editors, Preview instead of Edit |
| p5-agency | the agency owner sees the client with its 30-day responses and can filter stats to one funnel; agency staff get no menu link and their Enter is refused, while the owner's Enter goes in |
| p5-held-feature | a feature held back by its release switch (WhatsApp, while it is) is neither in a real workspace login's menu nor reachable by typing its address; skipped where it is released. The screens pass cannot check this, because the operator inside a workspace is exempt by design |
| p2-suspend | the console's Suspend locks the admin out to /workspace-unavailable, pauses the funnel, is audited and listed on /platform/audit; Unsuspend restores both |
| p2-console-create | the slug "admin" is refused; a typed-in password sends the first sign-in to /change-password; the creation is audited |
| p2-delete-purge | Delete sends the admin to /workspace-unavailable (no loop); Delete permanently removes the funnel, lead, page view, CAPI log, sale and webhook delivery by name, keeps the subscription payment, AI usage and login unlinked, and audits it |

It writes two qa-tn- workspaces (A on a Gate grant with three funnels, B on an Agency grant),
one more through the console form and one through public signup, and removes all of it at
the end. Audit rows stay: outliving the workspace is their job. No workspace it makes has a
pixel or CAPI token, so nothing reaches Meta.

`railway run --service Assessment` is there for BETTER_AUTH_SECRET: the webhook case stores
A's webhook secret the way the app reads it, and the signed-link control signs a link. Both
skip, with the reason, when it is absent. It is read from the process and printed nowhere.
The signup case spends one of the IP's 20 signups an hour.

**No test browser talks to Meta.** Every context the harness opens (sweep, screens,
tenancy) refuses Facebook's pixel script and endpoint (qa/src/drive/no-meta.ts), and every
workspace the tenancy pass makes is stamped as having already reported StartTrial before
anyone opens it. On prod the platform pixel is live, so both matter.

### On prod

Prod keeps its own file, so it never overwrites the staging login: qa/.env.qa.prod
(gitignored, like every qa/.env.qa* except the example).

```
QA_ENV_FILE=qa/.env.qa.prod BETTER_AUTH_SECRET=x BETTER_AUTH_URL=https://assess360.divineleads.guru railway run -e production --service Postgres npm run qa:admin
QA_ENV_FILE=qa/.env.qa.prod railway run -e production --service Assessment npm run qa:tenancy -- --i-know-this-is-prod
```

The prod file sets QA_BASE_URL, QA_DATABASE_URL (prod DATABASE_PUBLIC_URL) and
QA_SIGNUP_EMAIL, the owner's real inbox. With that set, the pass keeps ONE workspace
signed up under that exact address for good (never cleaned up, a year's Signal grant so
its funnels never pause), writes its password and id into the file as QA_KEEP_PASSWORD and
QA_FIXTURE_TENANT, and makes its throwaway signups plus-addresses of the same inbox, so
every welcome email lands somewhere read. QA_FIXTURE_TENANT is what `npm run qa:seed`
seeds the funnel fixtures into on prod: the platform there has a live pixel, the kept
workspace has none.

## What it does not cover

Whether Meta actually received and attributed an event, real email or WhatsApp delivery,
custom-domain certificates, and live payments. A paid funnel is driven as far as the
payment screen and no further. The pre-flight blocks the run when a live pixel or CAPI
token resolves, so a sweep cannot teach an ad account that thirty people converted.

The admin-screen pass (`--admin`) reads the run back through the owner's own views - the
submissions export and the stats export - using the same identities as the needle. It
needs `QA_ADMIN_EMAIL` and `QA_ADMIN_PASSWORD` in `qa/.env.qa`, which is gitignored; the
harness types them into the real sign-in form at run time and they are never logged.
Without them the pass says so and skips.

## Why it is written in TypeScript next to the app

Because the expectations are computed by the app's own modules: `flow/entry.ts`,
`gate-verdict.ts`, `scoring.ts`, `routing/engine.ts`, `flow/stages.ts`,
`meta-events.ts`. There is no second copy of any rule to drift from the real one. When
you change a rule, the expectation changes with it, and a case that then fails is a real
regression.

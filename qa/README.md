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

**Its other half is in the build.** The invariants that need no browser are asserted by
`scripts/verify-*.ts`, which the Railway build runs before `next build`, so a regression
fails the deploy rather than the screen: `verify:email-providers` (every provider
reaches its own region over HTTPS and refuses to send without a key),
`verify:whatsapp` (no `/register`, a good signup code is never thrown away, each sync can
only be spent once, a metric Meta did not report stays null), `verify:legal` (both policy
pages exist, every header link resolves, nothing company-specific is hardcoded),
`verify:contact-consent`, `verify:vault` and `verify:workflow-queue`.

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

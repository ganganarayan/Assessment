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

## Running it

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

## What it does not cover

Whether Meta actually received and attributed an event, real email or WhatsApp delivery,
custom-domain certificates, and live payments. The pre-flight blocks the run when a live
pixel or CAPI token resolves, so a sweep cannot teach an ad account that thirty people
converted.

## Why it is written in TypeScript next to the app

Because the expectations are computed by the app's own modules: `flow/entry.ts`,
`gate-verdict.ts`, `scoring.ts`, `routing/engine.ts`, `flow/stages.ts`,
`meta-events.ts`. There is no second copy of any rule to drift from the real one. When
you change a rule, the expectation changes with it, and a case that then fails is a real
regression.

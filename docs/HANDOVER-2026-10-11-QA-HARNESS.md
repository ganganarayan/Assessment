# Handover: the funnel verification harness (qa/)

2026-10-11. A browser-driven harness that proves a funnel behaves the way its own
configuration says it should, so that gates, exit routes, conditional routing, bands and
the Meta events each one fires can be checked in minutes instead of by hand.

## What it is

`qa/` is a Playwright harness with its own package.json and two dependencies
(playwright, yaml). It is excluded from the app's tsconfig and from eslint, and nothing
in the app's dependency tree references it, so the Railway install and the Next build
never see it.

It drives a PUBLISHED funnel on staging, one case at a time, and judges each case on
three sources: the screen, the rows, and the Meta event intent.

Full usage is in [qa/README.md](../qa/README.md).

```bash
railway run npm run qa:all                           # every fixture, one tally per funnel
railway run npm run qa -- --slug=<funnel>            # one sweep
npm run qa -- --slug=<funnel> --audit                # config + pre-flight only
npm run qa -- --slug=<funnel> --plan                 # the derived cases
npm run qa -- --slug=<funnel> --headed --slow=250    # watch it fill
npm run qa -- --slug=<funnel> --case=<id> --trace    # replay one
railway run npm run qa:abandon -- --slug=<funnel>    # settle the ten-minute verdict
railway run npm run qa:seed                          # the fixtures
```

## The three ideas worth keeping

**Nobody writes the cases.** The funnel is read from the database exactly as the public
page reads it, and the cases are derived: one per disqualifying gate answer, one per
gate band window, one per audience role, one per conditional route (found by
breadth-first search over the option graph, because a question can sit behind a jump
only one upstream answer takes), one per result band (aimed at the middle of the band
and hill-climbed, with the gate's own answers varied too when the gate dominates the
score), plus the awkward things people really do: reload mid-flow, come back after being
turned away, walk away from the opt-in, skip a required question, retake as the same
person. A band or route nothing can reach is reported as UNREACHABLE rather than
dropped, because a band nobody can land in is a finding about the funnel.

**The expectations come from the app's own modules.** `flow/entry.ts` decides the
opening screen, `gate-verdict.ts` the gate's score, band and exit, `routing/engine.ts`
the path, `scoring.ts` and the bands the result, `flow/stages.ts` the ending,
`meta-events.ts` what is reported. There is no second copy of any rule, so changing a
rule changes the expectation with it and a case that then fails is a real regression.
This is the reason the harness is TypeScript next to the app rather than a separate
Python suite.

**Absence is asserted as hard as presence.** The sharpest case in the whole sweep is the
opt-in walk-away: a GateEntry, optinSeenAt stamped, the ten-minute clock running, and no
lead, no submission, no CompleteRegistration. The second sharpest is a PAGE exit: a
rejection row, the exit's own event, and nothing a lead would ever produce.

## The verdict that lands ten minutes later

Leaving the opt-in starts a clock rather than firing anything, so the sweep asserts the
clock and `npm run qa:abandon` settles the verdict by running the app's own sweep
function and checking what fired against what the funnel says should fire. Two details
worth keeping: a lead-FIRST funnel produces no abandonment signal at all (the stamp and
the beacon both live on the dedicated opt-in step, which only a lead-after funnel has),
and the harness dispatches the page's own pagehide before leaving, because headless
Chromium drops a beacon sent while the page is being torn down.

## What it found

Mostly it found that the harness was wrong about the app, which is the point of running
it against the real thing. Each correction is a rule of the product worth knowing:

- **Two visitor ids.** A gate PASS is recorded against the browser's own id
  (localStorage `a360_xid`, which is also the CAPI external_id); a REJECTION against the
  server cookie (`a360_vid`), because somebody turned away never runs the client code
  that makes the other one.
- **A disqualifying answer is never submitted.** The runner routes them out from the
  click without adding that pick to the answers, so the gate's score is the questions
  answered before it.
- **A lead-capturing exit route files the opt-in under the route's own event**, never
  under CompleteRegistration. That is the entire point of exit routes.
- **A locked retake on a signup funnel goes to /sign-up**, not to the lockout screen -
  the lock doing its job with the ending deciding what that means.
- **The opt-in fields exist twice in the runner.** The lead-AFTER step uses the shared
  `leadFieldsBlock`; the lead-FIRST intro keeps its own copy. A field added to one does
  not appear in the other, and nothing points that out. Worth collapsing.
- **`collectProfession` defaults ON and REQUIRED.** With no profession options
  configured, the opt-in renders a required dropdown with nothing in it: the browser
  blocks the submit and says nothing about why. Worth a builder guard.

And one refactor it forced, in the app rather than the harness: the gate's arithmetic
was written out three times, in two `use server` modules nothing could import plus a
hand-written copy in `verify-exit-routes.ts`. It now lives once, in
`src/features/assessment/gate-verdict.ts`.

## Safety

The pre-flight reads what the funnel actually resolves - Meta pixel and CAPI token (ad
account, then tenant default, then the legacy columns, mirroring `resolveMetaConfig`),
payments, AI, SMTP, drips, webhooks - and BLOCKS the run when a live pixel or CAPI token
is there, because a sweep would otherwise teach Meta that thirty people converted.
`--force-live` overrides it; a non-staging host needs `--i-know-this-is-prod`.

Staging today resolves no pixel and no CAPI token anywhere, no CRM webhook, no active
drip, and Razorpay on a test key. AI and SMTP are live, and both warn.

## Fixtures

`railway run npm run qa:seed` keeps three funnels on staging that exist to be tested:
`qa-fixture-gate` (three kinds of exit route, bands, a text gate question),
`qa-fixture-routing` (SINGLE mode with all three jump actions) and `qa-fixture-audience`
(a role that continues here and one that hands off to another assessment). They are
platform-scoped deliberately: a separate tenant would drag billing gates into every
fixture and make them fail for reasons that are not the behaviour under test.

## What is not covered

Whether Meta received and attributed an event, real email or WhatsApp delivery,
custom-domain certificates, and live payments. The admin-screen pass (`--admin`) is
built but needs `QA_ADMIN_EMAIL` / `QA_ADMIN_PASSWORD` in `qa/.env.qa` to run; it has
not been exercised yet.

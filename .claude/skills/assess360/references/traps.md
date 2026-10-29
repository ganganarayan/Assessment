# Traps and mistakes to avoid

Every entry here cost a deploy cycle, a wrong diagnosis, ad spend, or a live outage. Read the
group that matches what you are about to touch.

## Build and deploy

1. 🔴 **A "use server" file may export ONLY async functions.** A sync function, a const, an
   object or a class breaks the Next build with "A 'use server' file can only export async
   functions". `tsc` does NOT catch it. Put shared constants and types in a plain sibling module.
   This has cost at least four failed builds (appHost, shapeOf, freeTemplateSlug, contactTenantOf).
2. 🔴 **An unused import or var fails the Railway build** through ESLint while `tsc --noEmit`
   passes clean. Railway keeps serving the old container, so the site looks healthy and the
   feature is simply missing.
3. 🔴 **`npx next lint` is not the gate.** It reported 3 warnings / 0 errors while the Railway
   build failed on 7 `no-html-link-for-pages` errors. Use `npx eslint .`. It is also deprecated.
4. 🔴 **All three gates can pass on code that white-screens the browser.** A `"use client"`
   component importing a chain that reaches src/lib/db/prisma constructs PrismaClient in the
   browser. Nothing is wrong on the server, so there is no log. `npm run verify:client-bundle`
   catches it. It was latent for days: webpack shook the module out until a fourth client
   component joined the page, so the commit that EXPOSES it is not the commit that caused it.
   Symptom to recognise: the error boundary renders, the server returns 200, no server error.
5. 🔴 **A hand-written migration must name the TABLE, not the Prisma model.** Most models are
   `@@map`ped (tenant, domain, app_setting, usage_counter). `ALTER TABLE "AppSetting"` took
   staging DOWN with a 502, because migrate deploy runs in the start command so the container
   never started. Nothing in tsc, eslint or `prisma validate` catches it. Recover with
   `prisma migrate resolve --rolled-back`, then make the SQL re-runnable with IF NOT EXISTS.
6. 🔴 **Postgres forbids USING a new enum value in the transaction that adds it.** An
   `ALTER TYPE ... ADD VALUE` goes in a migration file of its own.
7. 🔴 **Several sessions share this one working tree.** `git add prisma/schema.prisma` takes
   another session's uncommitted models. On 20-10-2026 a pushed schema declared Contact, Tag and
   ContactTag with no migration, so a plain `submission.findMany()` selected a missing column and
   every submissions read broke for two deploys. The build passed and /api/version served the
   new SHA, so every check reported success.
8. 🟡 `prisma generate` on Windows often dies with EPERM on query_engine-windows.dll after
   writing the .d.ts files, so it LOOKS like it worked and the local typecheck passes while
   Railway fails. A running qa suite holds that dll. Also: `Prisma.TransactionClient` is the
   wrong type for a `$transaction` callback on this `$extends`-ed client, derive it instead:
   `type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];`
9. 🟡 tsconfig sets `incremental: true`, so a stale tsconfig.tsbuildinfo makes tsc report
   phantom errors AND can pass while the real build fails. Delete it when the result looks wrong.
10. Scripts in scripts/ share one global scope unless they are modules, so a new script
    declaring a common name (TIMEOUT_MS, main) needs `export {}` at the top. tsx compiles them
    as CJS, so no top-level await: use `async function main()` plus `main().catch()`.
11. A verify script importing a `server-only` module needs `tsx --conditions=react-server` in
    its package.json entry. Do NOT add that flag to the react-pdf verifiers.
12. `NODE_ENV=production` makes `npm ci` omit devDependencies. Fixed by nixpacks.toml
    `npm ci --include=dev` plus .npmrc. Node is pinned to 22 in three places.
13. Auto-deploy can silently stop firing for ONE branch while the other keeps working. Diagnose
    from the deployed SHA, never from site health, and use "Deploy the latest commit", not
    "Redeploy" (which re-runs the old image and looks like a successful build of stale code).
14. 🔴 A backgrounded /api/version poll exits 0 even when it printed NO MATCH. Read the output file.
15. A build that fails in 17 seconds, where real builds take 6 to 8 minutes, is Railway having a
    moment. Push an empty retrigger commit before reading the diff.
16. Staging answering nothing at all (http=000) for minutes is the swap window, not a crash loop.
    A dead service and a mid-swap service look identical from a laptop.
17. 🔴 Partial promotion to main is usually impossible. A feature built on staging sits on top of
    whatever else is there, and cherry-picking it alone conflicts in schema.prisma and leaves the
    schema disagreeing with its own migrations folder, which breaks migrate deploy before the app
    boots. It worked once, for /offers, only because those commits touched marketing files
    nothing else had touched. Check `git log --reverse origin/main..staging` before promising one.
18. `git cherry` lies after this much history divergence. The decisive check is file CONTENT, and
    the confirmation worth having before pushing main is an empty `git diff --stat staging HEAD`.
19. A stale worktree holding main blocks `git checkout main` entirely. Check `git worktree list`.

## Tenancy and scope

20. 🔴 **The /admin PAGES scope by `actingTenantId()`; their export ROUTES did not.** Four API
    routes were wrong at once, one of which returned every tenant's assessments. Scope the ROUTE,
    not just the page. Surfacing an /admin feature on /w is exactly when this bites.
21. 🔴 `listAssessments` pinned a literal `tenantId: null`. After the funnel moves, /admin would
    show zero assessments, therefore zero submissions and an empty picker everywhere. The fix has
    to follow the data function, not the page.
22. 🔴 Writes stamping `scope.tenantId` while reads resolve the Platform tenant: an assessment
    created from /admin vanished the instant it was saved, while its public funnel served fine
    the whole time. Always stamp through `configTenantOf(scope)`.
23. 🔴 `AppSetting.id` defaults to `"singleton"`, so a tenant upsert omitting an id collides with
    the platform row's PK. Every tenant without a settings row failed with P2002 on its FIRST
    save of anything and crashed /w/settings.
24. A per-tenant settings card added only to /w is invisible to the owner, who lives on /admin.
25. 🔴 `impersonating` must not be reused for agency access: across /w it means "skip the caps",
    so reusing it would hand every client workspace unlimited assessments, AI and API tokens.
26. An agency tenant has no billing, and that took FOUR places to express: the nav, the route,
    the paused banner CTA, and a third WorkspaceLocked reason.
27. `subscription.cancelled` fires on the PLATFORM scope. emitEvent scopes delivery by tenantId,
    so passing the cancelling tenant would send the webhook to the person leaving.

## Money, Meta and ads

28. 🔴 **A preview must never reach Meta's Conversions API, and it nearly did twice.** First a
    preview run that reached the result page fired CompleteRegistration and the completion event
    into the live ad account, while a comment asserted the opposite. Then the workflow CAPI step
    was complete, typechecked and gated, and would have fired a real conversion every time the
    owner previewed their own funnel. The guard lives at the SENDER (`CapiEventInput.preview`),
    plus `Submission.isPreview` on the row for deferred fires. Any new ad-reporting path must
    read it, as part of the definition of done.
29. 🔴 `readMetaEvents` treats a MISSING key as ON. A brand new event key must go in
    `DEFAULT_OFF` or it starts firing from every funnel on the platform unasked.
30. 🔴 **Two sources of truth that disagree fail SILENTLY.** The ad-account work exposed four at
    once: Settings wrote a column nothing read (saving a pixel changed nothing and reported
    success); an optional `adAccountId` parameter no caller passed, so every event went to the
    default; the publish lock was per tenant so a funnel on a second account published on the
    first one's credentials; and a deferred capi_log fire had no account stamp, so a sale captured
    on one account re-fired against another.
31. **The trick that found them:** make the question REQUIRED and let tsc list every call site.
32. 🔴 Checkout must not write the entitlement before the money. `createSubscription` upserted
    plan, term, status and limitsSnapshot at checkout START, which PARKED an active customer the
    instant the Razorpay modal opened and left them entitled to a plan they never bought if they
    closed it. The same write overwrote `razorpaySubscriptionId`, so the cancel-the-replaced-one
    branch was comparing the new id with itself and never ran: every upgrade left the old
    subscription live and charging, silently.
33. 🔴 A slot payment must never reach `activateSubscription`: it would overwrite the tier's
    subscription id and renewals would stop silently. And a stored slot subscription id is NOT
    proof of payment, Checkout merely opened.
34. 🔴 Pass the product CODE, never the amount. A server action is a public endpoint.
35. 🔴 Quantity multiplies the BASE plan price. 249 x 2 is not 249 + 29, which is why slots ride
    a second subscription at all.
36. 🔴 An env plan-id override is how a $249 page charges $199 in silence. All six
    `RAZORPAY_PLAN_ID_*` vars were deleted with `planEnvOverride`.
37. The annual term is wrong by a factor of twelve in three places if it is only a second price:
    the usage window (Razorpay moves currentPeriodStart once per CHARGE), the ledger row and the
    Meta Purchase value, and the upgrade-only guard.
38. 🔴 **A non-critical side effect must never crash a money path.** A corrupt encrypted Meta
    token threw straight through `startSubmission`, so every live opt-in returned "Something went
    wrong" with the lead captured and the user blocked. Every encrypted-secret read on a live path
    is now fail-soft, and every post-capture side effect is wrapped.
39. 🔴 A password manager autofilling the hidden honeypot made the owner's own submits look like a
    bot while 86 real submissions kept flowing. A returned guard has NO error digest, so "get the
    prod log" cannot help. When a form shows a generic error, first ask whether it is per user.
40. Attribution needs the click id `fbc`, rebuilt as `fb.1.<optinTimeMs>.<fbclid>`. Without it
    Meta RECEIVES but does not ATTRIBUTE. Timestamps are UNIX MILLISECONDS.
41. `event_source_url` is required by Meta or the event is blocked. Enforced at `withSourceUrl()`.
42. Production `sendCapiEvent` must never attach `test_event_code`.
43. 🔴 A blank `eventName` on a gate exit used to fall back to the exclusion event, so one cleared
    field filed waitlisted people into the ad exclusion audience: the costliest prospects locked
    out of the ads, with nothing reporting a fault. `neverExclude` plus `exitEventName(exit)` is
    the one decision point.
44. `FunnelEventCount` counts EVENTS not people and is append-only. CompleteRegistration is still
    not counted into that panel, so it cannot show the event most campaigns optimise toward.

## UI and framework

45. 🔴 **A layout does not re-render on a client navigation.** /w/layout.tsx reads x-pathname to
    decide the parked lock, so the decision is made once on first load and kept for every Link
    click after. A parked customer clicked "Choose a plan", the URL changed and the lock panel
    stayed, so nobody on a lapsed plan could pay. Escapes from the lock must be full page loads.
46. `parkedSession` is the ACCOUNT, `locked` is THIS REQUEST. Gating anything else on `locked`
    applies it everywhere EXCEPT the pages a parked customer is sent to.
47. Hidden builder steps still save: all fields live in one `values` object posted whole, so never
    split it per step. A manager-only step belongs in neither FORM_FIELD_STEPS nor the form blocks.
48. `color-scheme` must be declared on :root and .dark or every native control (select lists,
    date pickers, scrollbars) renders light on a dark page. That, not the select's own styling,
    was the unreadable category dropdown.
49. A standing border alone on an identical background is invisible. Fields need
    `--field-border` AND a lifted `--field-bg`.
50. 🔴 Never auto-navigate a funnel run into an authenticated area. Finishing an assessment and
    signing in are separate events; breaking it teleports a tenant out of their own test run.
51. `runCompletion` takes explicit id and token arguments because React state is not synchronous
    right after `setSubmissionId`.
52. The opt-in fields exist TWICE in assessment-runner.tsx, a shared block and a private copy on
    the lead-first intro. A field added to one does not appear in the other.
53. Saving on blur uses one `onBlur` on the section wrapper, because React's onBlur is focusout
    and bubbles, so a field added later is covered without anybody wiring it.

## Data and caching

54. 🔴 **The snapshot is a CACHE.** It bit three times in one day: a new field made `.length`
    throw on every historical result page and PDF; a scoring fix only applied at scoring time so
    old submissions kept the wrong reading; and new config keys read `undefined` off the stored
    config and produced NaN across the whole offer table. Rules now: read every collection
    defensively, RE-DERIVE inputs from the stored ANSWERS, and put the stored config through
    `resolveEngineConfig` to merge over current defaults.
55. The cached funnel payload must be dropped by every funnel-visible write, or a tester reads the
    pre-save funnel and concludes the feature does not work. `npm run verify:gate` enforces it.
56. A release switch is PER DATABASE; src/lib/marketing/content.ts is NOT. That one file compiles
    into the build serving production, so a capability card drops `soon` only when the PRODUCTION
    switch is on. Seeing the feature in your own staging menu is what causes the mistake.
57. Fail CLOSED on feature releases: every catalog default is false, because the same code runs on
    staging and prod where the live answer differs. A first attempt seeded three features ON as
    "already live", which was true on staging and would have released them to every prod customer.

## Infrastructure

58. 🔴 **Railway blocks outbound SMTP.** Bitten three times. Go straight to the provider's HTTPS
    API on 443, do not try SMTP first.
59. 🔴 Railway caps custom domains per SERVICE and we hit it at 3. Cloudflare for SaaS is armed in
    PRODUCTION ONLY, so custom-domain work cannot be exercised on staging at all: it falls back to
    the Railway path and looks either broken or deceptively fine. Read `saasArmed` first.
60. 🔴 infra/cloudflare-worker.js is NOT the deployed artifact until `npm run worker:deploy` runs.
    A hand-pasted script with no zone pass-through took FOUR live apps down for about four hours
    because its `*/*` route rewrote every host in divineleads.guru. A variable edit is not a code
    deploy. And **never verify this by status code**: a rewritten request returns a healthy 200
    from the WRONG app. Verify by the identity of the app answering, its title or its own
    /api/version shape.
61. 🔴 Routes declared in wrangler.toml are MANAGED by it, so a route live-but-not-in-the-file
    gets removed, and removing `*/*` breaks every custom hostname at once.
62. 🔴 **AWS SDK v3.729+ signs a checksum of an EMPTY body into presigned PUT URLs**, so R2
    rejects every browser upload. The symptom lies: the progress bar climbs and dies at a
    percentage that MOVES between attempts, and R2's error carries no CORS header so the browser
    reports a bare network error. Build the S3Client with `requestChecksumCalculation` and
    `responseChecksumValidation` set to "WHEN_REQUIRED". Distinguish CORS by bytes sent: 0 bytes
    is CORS, partial means CORS already passed.
63. 🔴 An R2 bucket location is fixed at creation forever. Always pass a location hint (apac).
64. A Vault object key is minted once and NEVER rewritten. Mirroring the folder path into the key
    would 404 every live embed the first time someone tidied a folder, silently.
65. `PutBucketLifecycleConfiguration` REPLACES the whole configuration, so read the existing
    rules back and swap yours in by id.
66. 🔴 A script needing the app's own secrets needs BOTH services. The linked Railway service is
    Postgres, so plain `railway run` gives the DB's variables and not BETTER_AUTH_SECRET, and
    anything decrypting a settings column then reports it MISSING when it is present and correct.
    Run it as:
    ```bash
    PUB=$(railway variables --environment <env> --service Postgres --json | jq -r .DATABASE_PUBLIC_URL)
    DATABASE_PUBLIC_URL="$PUB" railway run --environment <env> --service Assessment npm run <script>
    ```
67. The deployed DB IS reachable from the laptop via DATABASE_PUBLIC_URL. The internal host
    postgres.railway.internal is not. scripts/public-db-url.ts swaps it in and must be imported
    FIRST, ahead of any PrismaClient construction.
68. Running any script that imports auth.ts needs `--conditions=react-server`, because the chain
    reaches `import "server-only"` and only that export condition resolves to the empty build.
69. Staging and production have SEPARATE databases, and secrets are per environment, so a token
    resolving on one 404s on the other and some features can only be verified on prod.

## Testing with Playwright

70. 🔴 The sign-in form is a client component: before React hydrates the submit button has no
    handler, no request leaves the browser, and the page sits on /sign-in looking exactly like a
    refused password. Wait for networkidle, then watch for the /api/auth/sign-in response.
71. 🔴 Clicking a server action and waiting for networkidle is NOT waiting for the action.
    networkidle returns instantly because nothing is in flight yet, and the next goto aborts the
    action mid-request with no error anywhere. Wait for the redirect the action performs.
72. 🔴 An `arrived()` helper asserting only "not /sign-in" scored four green checks for a screen
    that was never opened. Assert the landed pathname IS the requested path.
73. Playwright must send a plain Chrome UA: src/lib/bots.ts flags playwright and headless, and
    bot traffic is excluded from the funnel's numbers.
74. Two visitor ids: GateEntry is keyed on the browser's localStorage a360_xid, GateDisqualification
    on the server cookie a360_vid. Querying the wrong one reads as "the funnel never recorded it".
75. qa/.env.qa used to BEAT the process environment, so a run meant for prod silently read staging
    and reported 15/15 for the wrong host. Read the printed "Screens on <url>" line.
76. Headless Chromium drops a beacon sent during teardown, so dispatch pagehide before leaving.

## Reasoning and reporting

77. 🔴 **Ask, do not assume.** A "missing imported assessment" was diagnosed twice as platform
    ownership, both times assuming the super-admin Import page had been used. The owner had
    imported from the tenant workspace, and the real cause was unrelated. Name the fact the
    conclusion depends on and ask for it in one line, while continuing anything that does not
    depend on the answer.
78. 🔴 When a feature "does not work", first confirm WHICH environment was tested. The owner often
    tests production while the fix is only on staging. Error strings matching REMOVED code are the tell.
79. 🔴 When the user's input is sensible and the output is absurd, suspect the system's
    interpretation first. The 100x revenue bug came from reading "7 out of 10" as 7 percent, and
    the first fix made correctness depend on an operator setting a unit and then told the
    RESPONDENT to re-check a perfectly correct answer. Never build UI that blames the user for the
    system's ambiguity, and do not make correctness depend on remembered configuration when it
    can be derived from the question itself.
80. 🔴 Check what runs AFTER generation, not just the prompt. An unconditional crisis-line safety
    net appended a mental-health helpline to every top-band result in every funnel, including a
    holiday assessment.
81. When an env var looks dangerous, the first question is whether it should exist at all, not
    whether it is set correctly. And CHECK before telling the owner to go and check.
82. A verify check that counts a string in a source file must strip comments first: these modules
    explain the trap they avoid, so the warning text was being counted as the bug. And negative-
    control every new check, one was written with a match window the file had already grown past,
    so it passed while seeing nothing.
83. Verifying a deploy by /api/version proves the SHA shipped and nothing more.

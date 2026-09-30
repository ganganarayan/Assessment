# Handover — state, open items, working rules

Last updated 30 Sep 2026 (model change shipped to staging). Written so the next session starts with the context instead of
rediscovering it. Update it as things land; delete the parts that stop being true.

---

## 1. Working rules (agreed with the owner)

- **Two branches only: `staging` and `main`.** No feature branches, no pull requests.
- **Everything is committed straight to `staging`.** Railway auto-deploys `staging` to
  the `orbitq-assess` environment. Do not ask first — staging is always authorised.
- **`main` is production, and only on an explicit yes.** Never promote without being asked.
- **The owner does not read code or diffs.** Describe changes as what is different in
  the app and what they need to click — never as files, lines or patches.
- **Parity is the default.** Any feature on the super-admin surface belongs on the tenant
  surface too, unless the owner explicitly scopes it to the platform. Do not assume a
  screen is "admin only" because it currently lives under `/admin`.
- Run `npm run typecheck` before committing. Never run a local `npm run build`; the
  Railway build is the check (see CLAUDE.md).
- After pushing, verify with `GET /api/version` — the commit SHA is the fingerprint.
  Staging builds run ~4–5 min; wait before the first poll rather than polling in a loop.

---

## 2. Where things stand (30 Sep 2026)

**Production (`main`) = `aeb1402`.** It has the break-glass recovery tooling and
everything before it. It does **not** have the workspace-parity or export-scope work.

**Staging (`staging`) = `5d9a84e`**. Ahead of production by:
- workspace parity: `/w/ai`, `/w/audiences`, `/w/nurture`, Export All on `/w/assessments`
- the admin-export scope fixes (see §4)
- **the tenancy model change (§3a/§3b) — shipped 30 Sep**
- the re-home tooling (not yet run anywhere)

**No data has been moved in any environment.** Both databases are untouched. The
migration in `5d9a84e` creates the Platform tenant row and nothing else — it moves no
data, on purpose (see §3d).

---

## 3. The re-home programme (the main open work)

**Goal.** Move the owner's platform data out of the `tenantId = null` scope into a real
tenant, then re-point domains: platform + landing at `assess360.divineleads.guru`,
Apply Gita served at `assess.applygitawisdom.com` as a custom domain.

### 3a. DONE (staging `5d9a84e`) — the model was fixed first

`tenantId = null` used to mean five different things. Each now has its own spelling:

| Where | What `null` used to mean | What it is now |
|---|---|---|
| `lib/billing/gate.ts` (5 sites) | unmetered, every feature on | `isBusinessTenant()` — the platform short-circuits |
| `lib/billing/plan-resolve.ts` | `UNLIMITED_LIMITS` | same, keyed on the platform tenant |
| `lib/settings/config.ts` | fall back to env vars | transitional platform-only fallback that **logs each gap** |
| `features/admin/data/analytics.ts` | "the platform's own rows" | `Scope` — `{ kind: "tenant" }` |
| `lib/tenant/acting.ts` `tenantScope` | "super admin — show everything" | `Scope` — `{ kind: "all" }` |

The last two were the same value with opposite meanings. They are now separate variants
of a union, so nothing can read one as the other.

**What shipped:**
- **Platform tenant** is a real row, `id = "platform"` (not a cuid, so recognising it is
  a string compare — no query on the billing or settings hot paths). Seeded by migration
  `20260930000000_platform_tenant`. Carries SCALE, but code short-circuits it to
  unlimited: the platform is not a customer of itself.
- **Scope is a type** (`lib/tenant/scope.ts`). `actingDataScope()` answers "which rows",
  and an owner with no workspace entered gets **all tenants** — which matches what the
  write paths already did, and is what keeps the funnel screens populated after the
  funnel moves. Scoped to the platform's own rows they would have gone empty, because
  the platform does not run a funnel.
- 🔴 **The one that would actually have broken the console:** `listAssessments` pinned a
  literal null. After the funnel moved, /admin would have shown **zero assessments** —
  and therefore zero submissions and an empty assessment picker everywhere.
- **AppSetting addressing has one choke point** (`lib/settings/tenant-row.ts`). The
  platform row is reachable as either `null` or `"platform"`, so a settings save can
  never create a *second* row and split the live pixel and Razorpay keys across halves.
- **Env is launch-only now.** The remaining env reads are a transitional platform-scope
  fallback that logs which value it served, so the gaps are visible in the deploy logs
  instead of being silently permanent. `npm run settings:from-env` copies them in.

### 3a-bis. Still open in the model

🟡 **Settings writes still use `scope.tenantId`, not the platform tenant.** The right
accessor ("which config row do I write") was deliberately NOT wired, and the reason is
in a comment at the bottom of `lib/tenant/acting.ts`: for AppSetting it already works via
the choke point, but the per-tenant CONTENT tables those screens also write — AiPromptVersion
above all — would filter on `"platform"` while the existing versions are still unowned.
That is an empty AI prompt screen and a new version nobody can see.

Residual to know about: **after** the funnel move but **before** the NOT NULL commit, a
prompt version created from /admin without entering a workspace is stamped null and
becomes one more row NOT NULL will reject. `npm run verify:tenancy` catches it. Wire the
accessor in that same commit.

**Agreed target:** a real **Platform tenant** row, `tenantId` made required, every null
backfilled. Two tenants, not one — a Platform tenant (the SaaS, where the owner's account
lives) and Apply Gita (the funnel business, which the owner *enters* to operate). That
keeps "run my funnel" separate from "administer the SaaS" and matches the domain split.

### 3b. DONE (same commit) — the backstop now guards the role, not the tenant

`isDemotion` in `lib/db/prisma.ts` used to throw on **either** a role drop **or** any
write attaching a tenant to the owner. The tenant half is gone; the role half is intact
and still refuses to write that account below SUPER_ADMIN.

Why that is safe: super-admin access comes from the **role or the owner email**
(`lib/auth/guards` `isSuperAdmin`), never from whether a tenant is attached. What locked
us out on 21 Sept was losing SUPER_ADMIN, which is exactly what is still blocked. A
tenant id cannot cost anyone their access.

`npm run rehome -- --platform` also refuses to run if the owner's role is already below
SUPER_ADMIN — the backstop prevents a demotion, it does not repair one, and attaching a
tenant to an already-demoted owner would leave no route back into /admin.

### 3c. Findings that gate the move (verified, still true)

- 🟢 **RESOLVED 30 Sep — Apply Gita is flagged unlimited on /platform.** It was on plan
  `FREE` with no subscription, and FREE has `capi: false`: moving the funnel onto it would
  have **silently stopped Meta CAPI**, locked responses past 25/month, and disabled the
  qualification gate, conditional routing, heatmap and API tokens. The `unlimited` flag is
  the durable fix (a plan column can lapse; the flag cannot) and `resolvePlan` checks it
  before the subscription. The SQL route — `UPDATE tenant SET plan = 'SCALE' WHERE slug =
  'apply-gita';` — still works if you'd rather rate it against a tier.
  🔴 **This flag was only honoured at runtime.** `verify:tenancy`, the re-home preflight,
  `/w/billing` and the subscribe action all re-derived the plan from the columns, so an
  unlimited tenant read as **Free** — the verify reported a phantom 🔴 CAPI failure, the
  preflight would have blocked the move over it, and the billing page offered to sell a
  plan the tenant already exceeds. All four now read `resolvePlan().unlimited`.
- 🔴 **Meta/Razorpay live in env, not the DB** (on staging both rows are blank). Env only
  feeds the platform scope, so a tenant that lacks these values has no pixel, no CAPI and
  a checkout that cannot sign an order. **The preflight now blocks on this** — it is the
  single most likely way to take the funnel dark, and it is why the owner's rule is that
  env holds only what the app needs to boot and everything else lives in Settings, scoped
  per tenant. Close it with `npm run settings:from-env`, then re-run the dry run.
- 🟡 **`META_DATASET_ID`**: platform CAPI uses that env var; a tenant uses its **pixel id**
  as the dataset. If prod sets them to different values, CAPI changes destination after
  the move. Still unverified against prod — the dry run now prints this comparison, so
  `npm run rehome -- --tenant apply-gita` under `railway run --environment production`
  answers it without writing anything.
- 🟢 Funnel URLs, Razorpay attribution and result links all survive a move — verified by
  reading the code, see §4.

### 3d. Tooling — rebuilt 30 Sep, still never applied anywhere

**The move is two steps, because there are two tenants. Run them in this order.**

```
npm run verify:tenancy -- --funnel apply-gita   # read-only: where things stand
npm run settings:from-env                       # close the env gaps (dry run)
npm run settings:from-env -- --apply

npm run rehome -- --platform                    # owner + platform settings row
npm run rehome -- --platform --apply            # then SIGN OUT, SIGN IN, check /admin

npm run rehome -- --tenant apply-gita           # the funnel data
npm run rehome -- --tenant apply-gita --apply

npm run rehome -- --revert .rehome/<file>.json  # exact undo of either step
```

Prefix each with `railway run` (add `--environment production` for prod), **from the repo
root** — `railway run` executes in the current directory, so running it from your home
folder fails with `ENOENT … package.json` before anything reaches the database.

Where a script takes a flag, calling it through `npx tsx` avoids npm's argument parser
warning about (and potentially swallowing) the flag:
`railway run --environment production npx tsx scripts/verify-tenancy.ts --funnel apply-gita`

- **`--platform`** attaches the owner's account to the Platform tenant and stamps the
  singleton AppSetting as the Platform tenant's row. The row's *contents* are untouched
  and it stays reachable by its id, so every existing settings read keeps working. This
  is the safe half — do it first and confirm you can still sign in.
- **`--tenant <slug>`** moves the funnel, and `--apply` is **GATED by a preflight**:
  - 🔴 blocks on a plan without `capi` (FREE/STARTER), with the exact SQL to fix it —
    asked via `resolvePlan`, so a workspace flagged **unlimited** on /platform passes
  - 🔴 blocks on any critical Meta/Razorpay value that is blank in Settings on both rows
    — and says so differently when the value lives only in env, because that is the case
    where the move *itself* is what switches the feature off
  - 🟡 warns when `META_DATASET_ID` differs from the pixel id (CAPI changes destination)
  - the escape hatch is `--allow-dark-funnel`, named so nobody uses it by accident
- It reconciles **per-table counts before against after** (`null=0`, `tenant = before.null
  + before.own`), so a table that was skipped shows up as a failure rather than as a
  quietly smaller total.
- 🔴 **It now covers `gateEntry` and `funnelEventCount`**, which the old 14-table list
  missed. A "successful" move would have left both pointing at nobody, and the later NOT
  NULL migration would have failed on tables nobody was watching.
- `scripts/rehome-platform-data.sql` is now **read-only inspection queries**. Its
  mutating half was removed: it had the same missing-tables bug and could not run the
  preflight, and two divergent movers where one silently orphans tables is a trap.

`npm run verify:tenancy` is read-only and safe against production at any time. Run it
before the move, after each step, and again before the NOT NULL commit.

### 3e. Domain phase — blocked on a design question

The owner wants **platform payments on `divineleads.guru`** and **Apply Gita payments on
`applygitawisdom.com`** — the apex domains, not the app subdomains. Today every payment
URL is built from the single `NEXT_PUBLIC_APP_URL` env value, so this needs a per-tenant
payment-domain concept. Not yet designed.

Also unresolved for that phase: `appHost()` (derived from `NEXT_PUBLIC_APP_URL`) is the
CNAME target for **every** tenant custom domain, so changing the app URL orphans existing
tenant domains until each is re-pointed.

---

### 3f. The NOT NULL commit (next, but NOT yet)

Deliberately left out of `5d9a84e`. 🔴 **Why it cannot ride along with a code change:**
Railway serves the OLD deployment until the new one passes its healthcheck, but
`prisma migrate deploy` runs in the start command — so the constraint lands while old
code is still taking traffic, and old code writes explicit `tenantId: null` on the funnel
hot path. A NOT NULL column rejects those: dropped leads and dropped CAPI events, on a
live funnel, for the length of a deploy.

The safe order is: **model semantics → compatible code → data re-home → verify → NOT NULL.**
The first two are done.

When the time comes, that commit should contain:
1. `npm run verify:tenancy` reporting zero unowned rows in **both** environments first.
2. The NOT NULL migration itself.
3. Wiring the config-tenant accessor (§3a-bis) — safe only once no unowned rows remain.
4. Deleting the `unowned` variant from `lib/tenant/scope.ts` and the null arm from
   `isPlatformScope()` in `lib/tenant/platform-tenant.ts`.
5. Deleting the env fallback in `lib/settings/config.ts` and the env vars with it.

## 4. Multi-tenant scoping — what was found and fixed

A sweep of all 33 API routes on 30 Sep (commit `b625f83`) after finding one unscoped:

- 🔴 `/api/admin/assessments/export-all` — was super-admin-only **and unfiltered**;
  returned every tenant's assessments. Now scoped; this was the reason the sweep happened.
- 🔴 `/api/admin/submissions/export` — carried **no tenant filter at all**. Now scoped.
- 🟡 `/api/admin/contacts/export`, `/api/admin/stats/export` — pinned to the platform
  slice, ignoring the workspace being operated. Now follow the acting scope.
- 🟡 `/api/admin/assessments/[id]/export` — no tenant check; an id from another tenant
  exported fine from inside a workspace. Now 404s.

Correctly guarded, left alone: cron routes (CRON_SECRET), both Razorpay webhooks
(per-tenant HMAC), public `v1` endpoints (scoped ApiToken), `/api/r` (result token),
`/api/admin/recover` (bearer secret), all three `/w` exports.

**Root cause worth remembering:** the pages scope by `actingTenantId()`; their export
links did not. When adding any new export or report, scope the route, not just the page.

---

## 5. Crons

- Schedules live in the **Railway dashboard** as separate cron services — `railway.json`
  defines none. The owner wants to stop depending on Railway for this.
- Options discussed: GitHub Actions cron hitting the existing `/api/cron/*` endpoints with
  `CRON_SECRET` (free, nothing to keep awake) or a dedicated scheduler app the owner also
  uses to wake their six apps. **Do not** build an in-app `setInterval` scheduler —
  multiple replicas each run their own timer, so every job fires twice.
- 🔴 **Known bug:** `sweepAbandoned` reads `abandonedAfterHours` from the **singleton**
  (`lib/events/abandoned.ts:22`) and applies it to every tenant's submissions. Tenants
  cannot set their own window. Fix alongside per-tenant cron enable/disable.
- `retryPendingWebhooks` drains all pending deliveries with no tenant filter — no
  per-tenant switch exists yet.

---

## 6. Structural recommendations (agreed direction, not yet built)

1. ~~A Platform tenant row~~ **DONE** (§3a). Required `tenantId` is the remaining half —
   see the NOT NULL note below.
2. ~~Make scope a **type**~~ **DONE** (`lib/tenant/scope.ts`). It landed as
   `{ kind: "tenant" | "all" | "unowned" }` rather than including "platform": the platform
   turned out to be ordinary *data* with a known id, not a scope semantic. `unowned` is the
   transitional variant for rows that genuinely have no owner yet, and it is deleted along
   with the nulls.
3. A Prisma extension that **refuses unscoped reads** on tenant-scoped models — the same
   pattern the owner backstop already uses. Catches the next `export-all` before it ships.
4. No env fallback for config: env seeds the Platform tenant once, then every read is a
   tenant row.
5. Impersonation audit log — once real tenants hold real data, entering a workspace to
   support them needs a record.
6. Per-tenant operational settings off the singleton, starting with the abandon window.

---

## 7. Operational notes and gotchas

- **The deployed DB is reachable from a laptop.** `railway run` injects the *internal*
  host (`postgres.railway.internal`), which only resolves inside Railway. `scripts/public-db-url.ts`
  swaps in `DATABASE_PUBLIC_URL` (the TCP proxy) for the break-glass scripts. The linked
  service is **Postgres**, not the app — that is why `railway run` yields the DB's vars.
- **Scripts that import `auth.ts` need `--conditions=react-server`**, because the chain
  reaches `import "server-only"`. Baked into `db:reset-password` and `db:seed`. Do **not**
  add it to the `verify:*` scripts — the react-pdf ones would get React's RSC build.
- Recovery: `railway run npm run db:reset-password -- <email> "<pw>"`. Add
  `--environment production` for prod; `railway run` uses the *linked* environment.
- **`npx prisma format` reformats the entire schema file** — a four-model change produced
  a 455-line diff. Do not run it casually.
- Staging's Postgres restarts occasionally; "the database system is starting up" means
  retry, not a broken connection.
- The repo has an untracked `landing/` Astro directory. **Stage explicit paths, never
  `git add -A`.**
- All stored secrets are encrypted with `BETTER_AUTH_SECRET`. Ciphertext copies verbatim
  between rows in the same environment, never across staging↔prod. 🔴 Rotating that secret
  makes every stored key undecryptable.

---

## 8. Housekeeping

The owner's password was visible in a screenshot shared into a chat on 28 Sep and should
be rotated wherever it is reused.

---
name: assess360
description: The Assess360 project brief. Load it at the start of any session in this repo, or when asked what has been built, what the working rules are, which mistakes to avoid, or what the owner has already decided. Covers the stack, the branch and deploy workflow, the pre-push gate, the full trap catalogue, every owner course correction, and the feature inventory with status.
---

# Assess360, the working brief

Assess360 is a multi-tenant **lead qualification engine** SaaS: a respondent passes a
qualification gate, answers a scored assessment, lands on a result page, and the funnel
teaches Meta who the right people are. Owner and sole stakeholder: Ganga Narayan Das
(gcp420@gmail.com), who is also the super admin.

Positioning frame for all copy: the category is **negative lead generation** and the
mechanism is **Gate, Score, Signal**. Signal, teaching Meta to stop finding the wrong
people, is the step no competitor has.

Stack: Next.js 15 App Router, TypeScript strict, PostgreSQL, Prisma, Better Auth,
Cloudflare R2, Razorpay, Meta CAPI, Railway, shadcn/ui, Tailwind v4, zod.

## Read this first, every session

1. **Check the branch before touching anything.** `git branch --show-current` must say
   staging. Several Claude sessions work this one checkout at the same time, so also run
   `git status --short` and look for edits that are not yours.
2. Read docs/HANDOVER.md for the live state, then the dated HANDOVER-*.md for the area
   you are about to touch.
3. The owner **does not read code or diffs**. Describe every change as what is different
   in the app and what they click.

## The five rules that are never negotiable

| Rule | Detail |
|---|---|
| Staging is always authorised | Commit and push to staging as the final step of the work, unprompted. Never ask "shall I push?" |
| main only on the owner's explicit word | Promote with `git checkout main && git merge --ff-only staging && git push origin main`. Histories were rejoined 17-10-2026, so ff works again. |
| No local builds, ever | Never `npm run build` / `next build` / docker / start the server. `prisma generate`, `tsc --noEmit`, `eslint` and the verify scripts are allowed. |
| Every human-read date is DD-MM-YYYY | Use `formatIST` from src/lib/date.ts. Never a locale-less `toLocaleString`. Machine payloads stay ISO-8601 UTC. |
| Never use an em dash or en dash | Anywhere: chat, copy, comments, commits, markdown, this file. Use a comma or a plain hyphen. |

## The pre-push gate

Run all of this before every commit. Each item catches something the others miss.

```bash
npx next typegen && npx tsc --noEmit && npx eslint . && npm run verify:client-bundle
```

- `tsc` alone does NOT catch an unused import, and the Railway build fails on it.
- `npx next lint` is NOT the gate. It passes while the Railway build fails. Use `npx eslint .`.
- `next typegen` regenerates .next/types so tsc can see App Router route signatures.
- verify:client-bundle catches a client component whose import chain reaches Prisma, which
  white-screens the browser while every other gate stays green.
- If a tsc result looks wrong or names a file you did not touch: `rm -f tsconfig.tsbuildinfo`
  and re-run. The incremental cache lies in both directions.
- If `prisma generate` errors at all (EPERM on Windows is common), do not trust the typecheck.
  Retry until it exits clean.
- For SEO or marketing content also run `npm run verify:seo`. For industry pages, `npm run verify:industries`.

The `npm run build` script chains about twenty `verify:*` scripts ahead of `next build`, so a
broken invariant fails the Railway deploy rather than the screen. Treat a verify failure as a
real finding, not a chore.

## Deploy and verify

- Railway, one project, two environments: orbitq-assess from staging, main env from main.
  Start command runs `npx prisma migrate deploy && npm run start`.
- Staging: https://orbitq-assess.applygitawisdom.com
- Production: **https://assess360.divineleads.guru**. NOT assess.applygitawisdom.com, which is
  the Apply Gita TENANT's custom domain. Marketing page content renders only on the platform
  domain.
- Verify with `GET /api/version` until `commit` matches the pushed short SHA. Builds now take
  **6 to 11 minutes**, so wait about 420s before the first poll, then poll at 35s.
- 🔴 A backgrounded poll loop exits 0 even when it printed NO MATCH. Read the output file and
  find the MATCH line. Never report a deploy as live off an exit code.
- `gh api repos/<owner>/<repo>/deployments` plus the statuses endpoint answers "did it build?"
  from outside, and the created_at gap is the real build duration.
- Failure shapes differ, use them to diagnose: a build or lint failure leaves the site HEALTHY
  on the old SHA; a failed migration gives **502** because migrate deploy is in the start
  command; total silence (http=000) for a few minutes is the swap window, not a crash.
- A build that fails in 17 seconds is Railway having a moment. Push an empty retrigger commit
  before hunting the diff.
- Schema changes are not proven by /api/version. Read a row from an affected table.

## Git hygiene in this repo

- Stage explicit paths. `git add -A` sweeps the untracked landing/ Astro directory into the commit.
- 🔴 Commit a schema edit **together with its migration in one commit**. `git add prisma/schema.prisma`
  takes another session's uncommitted models too, and a pushed schema declaring tables the
  database lacks breaks every read of that table silently.
- `git diff --cached prisma/schema.prisma` before committing and look for models that are not yours.
- Commit on Windows PowerShell with `git commit -F <tempfile>`. Inline `-m` with quotes breaks.
- `git push` writes progress to stderr and the tool wraps it in a NativeCommandError. The push
  still succeeded. Confirm from the `<old>..<new> branch -> branch` line.

## Where things live

```
src/app/              a/ (public funnel) b/ (booking) r/ (result token) pay/ u/ ls/
                      admin/ (super admin, 34 screens) w/ (tenant workspace, 34 screens)
                      api/ (admin, v1, billing, payments, track, cron, onward, r, version)
                      plus ~45 marketing and SEO routes at the root
src/features/<area>/  actions/ components/ data/ schemas, feature-based, 24 areas
src/lib/<area>/       pure and server libs: scoring, routing, meta, billing, tenant,
                      settings, events, webhooks, ai, workflows, automation, calendar,
                      contacts, whatsapp, marketing, storage, pdf, features (releases)
prisma/schema.prisma  5,777 lines, 196 migrations
scripts/verify-*.ts   the invariant suite, most of it chained into npm run build
qa/                   its own package, Playwright harness, excluded from the app tsconfig
```

Business logic stays out of the UI. Scoring, routing, gate verdicts, slot math and band
arithmetic live in pure modules that both the server paths and the verify scripts import, so
there is never a second copy of a rule to drift.

## The reference files

Load the one you need; do not read all four unless the task spans everything.

- **references/architecture.md**: tenancy model, scope types, settings addressing, the data
  model map, the public funnel flow, billing shape, release switches, integrations.
- **references/built.md**: the feature inventory with status (in prod / staging only /
  designed not built) and what is still open.
- **references/traps.md**: the full catalogue of mistakes to avoid, grouped by area. Read the
  group that matches what you are about to touch.
- **references/corrections.md**: every course correction the owner has made, with the reason.
  Read before proposing anything that looks like a style, naming or scope decision.

## Fast answers

- Tenancy: `tenantId = null` historically meant platform. The Platform tenant is now a real row
  with `id = "platform"`. Reads go through `actingDataScope()`, writes through
  `configTenantOf(scope)` which is non-nullable on purpose. Never stamp a raw nullable id.
- Settings: one AppSetting row per tenant, addressed only through
  `appSettingWhere` / `tenantAppSettingId` in src/lib/settings/tenant-row.ts.
- Env holds boot variables only (DATABASE_URL, BETTER_AUTH_SECRET, NEXT_PUBLIC_APP_URL, R2,
  CRON_SECRET). Every tenant setting goes in in-app Settings, per tenant.
- Parity is the default: a super-admin feature belongs on /w too unless the owner scoped it to
  the platform.
- Preview (`?preview=1`) does everything except reach Meta's Conversions API. The guard lives at
  the sender, and `Submission.isPreview` is on the row. Any new ad-reporting path must check it.
- Railway blocks outbound SMTP. Always use the provider's HTTPS API on 443.
- Crons that MUST exist on Railway: `cron:webhooks` (1 to 2 min), `cron:automations` (1 min),
  `cron:ai-costs` (daily). The lifecycle engine deliberately rides the in-app heartbeat instead.
- No real payment has ever run in this app. `verify:payments` proves configuration only.

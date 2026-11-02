Read Claude.md and create the architecture.
Do not write code until approved.

# Claude Instructions

Always read this file before making changes.

## Technology

* Next.js 15 App Router
* TypeScript
* PostgreSQL
* Prisma ORM
* Railway Deployment
* Cloudflare R2 Storage
* shadcn/ui

## Development Rules

* Mobile first
* Strict TypeScript
* No any types
* Server Actions preferred
* API routes only when necessary
* Use Prisma migrations
* Use Zod validation
* Reusable components only
* Follow feature-based folder structure

## Coding Process

Before generating code:

1. Explain architecture.
2. Wait for approval.
3. Generate implementation.
4. Generate tests.
5. Generate migrations.

Never create code without first explaining the approach, in compact version with lesser words.

## Authentication

Use Better Auth.

## Database

Use PostgreSQL.

## Storage

Use Cloudflare R2.

## Deployment

Use Railway.

## Multi-Tenant Rules

Support:

* Super Admin
* Admin

Every assessment belongs to a tenant.

Every tenant can have custom domains.

## AI

Support:

* OpenAI
* Claude
* Gemini

AI provider must be configurable.


# Assessment Engine Rules

Read the relevant files from repository.

Create a production-grade Assessment Engine SaaS.

Requirements:

- Next.js 15
- TypeScript
- PostgreSQL
- Prisma
- Railway deployment
- Store files in Cloudflare R2
- Mobile-first UI
- Follow shadcn/ui patterns
- Generate migrations
- Assessment Builder
- Category Builder
- Question Builder
- Custom scoring per answer
- Category weights
- Result interpretation engine
- AI Question generation
- AI report generation
- Custom Domain Integration
- Super Admin for Assessment app owner, that is me, the creator of the app
- Admin for sub-domain Assessment Builder

Do not start coding.

First generate:

1. Folder structure
2. Database schema
3. Prisma models
4. API architecture
5. Deployment architecture

Wait for approval.

## Architecture Rules

Always prefer scalable architecture over shortcuts.

Always design for multi-tenant support.

Always separate business logic from UI.

Never hardcode tenant-specific values.

Never create code that prevents future SaaS commercialization.

Always design modules to be reusable across assessments.

Always keep assessment logic independent from presentation layer.

Prefer configuration over hardcoding.

Prefer extensibility over temporary solutions.

# Build & Deployment Workflow

* Run `npm run typecheck` before committing.
* Do NOT run a local `npm run build`, rely on the Railway build (staging) for build validation.
* Commit and push to the `staging` branch only.
* Do NOT push or merge to `main` (production) until explicitly told.
* After pushing, verify the Railway staging deployment succeeded.

<!-- standing-rules:begin (shared across every repo; edit here and it is copied, do not reword per repo) -->
## Standing instructions

These used to live only on the owner's Windows PC, so a cloud session never saw
them. They are committed here on purpose: a cloud session starts from a fresh
clone and gets nothing that was only configured on a machine.

### Branching and environments

- Exactly two long-lived branches: **main** (production line) and **orbitq**
  (staging). Never master; if a repo still has one, rename it to main.
- The staging branch is always named orbitq and the staging service is the
  *-staging service.

### Build and deploy: auto-push to staging, never build locally

- **Auto-push to staging without asking.** Anything built or changed goes to the
  staging branch automatically: commit and push as the final step of the work,
  then verify on staging. Do not ask whether to push. Main/prod stays gated.
- **No builds in the session, local or cloud.** Never next build, docker or
  npm run build, never start the server, never rely on "it works in my
  sandbox". The Railway environment differs from a laptop *and* from a cloud
  container, so a passing run in the session proves nothing about production.
  Write the code to the files; the app is verified on staging.
  (prisma generate for codegen and tsc --noEmit for a typecheck are allowed:
  they compile and verify types, they do not build or run the app. Unit tests
  are fine too.)
- **Static syntax-check every changed file before committing** (this is not a
  build): node --check for changed JS/MJS, an EJS compile check for changed
  templates, a typecheck for TypeScript projects. A syntax or type error must
  never reach a staging commit.
- Flow: commit to staging, deploy staging, verify on the live staging URL
  (GET /api/version matches the pushed SHA). Then, **only when the owner
  explicitly says so**, fast-forward main, deploy prod, verify. "Push to main"
  means that whole flow; never touch main or prod unprompted.
- No exceptions and no editorialising. Do not decide a change is a runtime
  no-op and skip the push. Consistency over cleverness.

### Deploy polling

Record each build's duration. On the next deploy do not start polling at once:
wait about (last build duration + 10 seconds) before the first status check,
then poll at modest intervals until it is Online. Most of the build window
should carry zero polls.

### Status colours and formatting

- Signal state with coloured dots: 🟢 green = OK / success / safe,
  🟡 yellow = not OK / needs attention / caution, 🔴 red = dangerous /
  destructive / blocked.
- The owner's chat theme renders inline code spans in red, which reads as
  danger. Avoid backticks for branch names, file paths, commit hashes and
  commands written in prose: use plain text, bold, or markdown file links.
  Keep backticks for real code and copy-paste commands.

### Dates and times: Indian format everywhere

- Every timestamp a human reads is DD-MM-YYYY, and DD-MM-YYYY HH:MM (24-hour)
  when the time matters. UI, tables, exports, CSV columns, PDFs, emails,
  WhatsApp, logs people read. MM-DD-YYYY is never acceptable.
- **Never leave the locale to the runtime.** toLocaleString() or
  toLocaleDateString() with no locale, or with undefined, renders in the
  server's or browser's locale, which on Railway is US order. Never ship a bare
  one: always go through the project's own formatter.
- Times are IST (UTC+05:30) computed from a fixed offset, not from the host's
  timezone (the server runs UTC). A new project gets the same formatter helper
  before its first date is rendered.
- Machine-to-machine fields (JSON payloads, APIs, DB columns, round-trip export
  bodies) stay ISO-8601 UTC. This rule is about what a person reads.

### Configuration lives in the app, not in env

All user- and tenant-scoped configuration (SMTP and email keys, API keys,
sheets, schedules) lives in the app's own settings UI and its tenant config
table. Environment variables are only for platform infrastructure. A cloud
session has no .env and does not need one: do not ask for keys, and do not add
an env var for something the settings UI owns.

### Writing

- **No em dashes.** Never write the U+2014 character in code, UI text, commit
  messages or chat. Grep the changed files before committing.
- Be concise. End every reply with a token footer: this-turn in and out
  (estimated), cumulative, context-window fullness, and a continue-versus-new-chat
  nudge. Before a task or phase, give a tentative token estimate, proceed
  without asking, then log estimate against actual and calibrate (gut estimates
  run about 2 to 3 times the objective per-turn counter).
<!-- standing-rules:end -->

### This repo

Staging branch here is **staging**, not orbitq: it deviates from the rule above and origin also carries an orbitq branch. Do not rename either without being told to; ask which one the staging service deploys.

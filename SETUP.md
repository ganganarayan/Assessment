# Assessment Engine SaaS — Setup (Phase 1)

Production-grade multi-tenant foundation: Next.js 15, TypeScript, Prisma +
PostgreSQL, Better Auth, Cloudflare R2, shadcn/ui, deployable to Railway.

> Phase 1 scope: project skeleton, auth, multi-tenancy foundation, and the
> `Tenant / Domain / Theme / User` models only. Assessment/Category/Question
> builders, AI, and analytics are Phase 2.

---

## 1. Prerequisites

- Node.js 20+ (22 recommended)
- A PostgreSQL database (local or Railway)
- A Cloudflare R2 bucket + API token

## 2. Install

```bash
npm install
```

## 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`. Generate the auth secret with:

```bash
openssl rand -base64 32
```

Key variables:

| Variable                  | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `DATABASE_URL`            | PostgreSQL connection string                     |
| `BETTER_AUTH_SECRET`      | Session signing secret                           |
| `BETTER_AUTH_URL`         | App base URL (e.g. `http://localhost:3000`)      |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for subdomains (`lvh.me:3000` local) |
| `R2_*`                    | Cloudflare R2 credentials + bucket               |

> Local subdomains: use `lvh.me` (wildcard → 127.0.0.1). Visit
> `http://acme.lvh.me:3000` to exercise the `acme` demo tenant.

## 4. Database: migrate + seed

```bash
npm run db:migrate      # create & apply the initial migration
npm run db:seed         # create super admin + demo tenant
```

Seeded accounts (change immediately):

- **Super Admin** — `owner@example.com` / `ChangeMe123!`
- **Tenant Admin** — `admin@acme.com` / `ChangeMe123!`

## 5. Run locally

```bash
npm run dev
```

- Root domain → `http://localhost:3000` (no tenant)
- Subdomain → `http://acme.lvh.me:3000` (tenant `acme`)

The homepage shows **"Assessment Engine SaaS Foundation Ready"** and the
resolved tenant context.

## 6. Useful scripts

| Command                  | Description                       |
| ------------------------ | --------------------------------- |
| `npm run dev`            | Start dev server                  |
| `npm run build`          | Production build (runs generate)  |
| `npm run lint`           | ESLint                            |
| `npm run typecheck`      | TypeScript, no emit               |
| `npm run db:studio`      | Prisma Studio                     |
| `npm run db:migrate`     | Create/apply dev migration        |

---

## 7. Deploy to Railway

1. **Create project** → New Project → Deploy from GitHub repo.
2. **Add PostgreSQL** plugin. Railway injects `DATABASE_URL` automatically.
3. **Set variables** (Service → Variables): `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`,
   `ALLOWED_ORIGINS`, and all `R2_*` values.
4. **Build/deploy** uses the `Dockerfile` (see `railway.json`). The start
   command runs `prisma migrate deploy` then boots the standalone server.
5. **Custom domains**: add tenant domains under Railway → Settings → Domains
   (or a wildcard `*.yourdomain.com`), then create matching `Domain` rows so
   middleware can resolve them.

---

## 8. Architecture at a glance

```
src/
  app/                 Routes (App Router) + /api/auth catch-all
  components/ui/        Reusable shadcn primitives (no business logic)
  features/             Feature modules (Phase 2)
  lib/
    auth/               Better Auth server/client + session helpers
    db/                 Prisma client singleton
    storage/            Cloudflare R2 abstraction
    tenant/             Host → tenant resolution + request context
    env.ts              Zod-validated environment
  middleware.ts         Edge multi-tenant resolution
prisma/                 schema.prisma + seed.ts
```

Tenancy: `middleware.ts` parses the host → injects tenant headers →
`lib/tenant/context.ts` reads them server-side and loads the `Tenant`
(by slug for subdomains, by `Domain` row for custom domains).

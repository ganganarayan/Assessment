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
* Tenant Admin

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

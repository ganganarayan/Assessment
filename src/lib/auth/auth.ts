import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { isPlatformOwner } from "@/lib/auth/platform";
import { generateId } from "@/lib/ids";

/** Slug from a name/email: lowercase, alphanumeric + hyphens, capped. */
function tenantSlugFrom(seed: string): string {
  const s = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return s || "tenant";
}

/**
 * Better Auth server instance.
 * Uses the Prisma adapter against our PostgreSQL schema.
 * Email/password is enabled for Phase 1; OAuth providers can be added later.
 *
 * The extra `role` and `tenantId` fields are surfaced on the session user so
 * middleware and Server Actions can make multi-tenant authorization decisions.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        input: false,
      },
      tenantId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Self-serve provisioning: every new signup (except the platform owner) gets
        // their OWN tenant automatically and becomes its admin — no manual setup.
        // Never throws into the signup flow; a failure just leaves them assignable.
        after: async (user) => {
          try {
            if (isPlatformOwner(user.email)) {
              await prisma.user.update({ where: { id: user.id }, data: { role: Role.SUPER_ADMIN } });
              return;
            }
            const seed = user.name || user.email.split("@")[0] || "tenant";
            let slug = tenantSlugFrom(seed);
            for (let i = 0; i < 5; i++) {
              const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
              if (!clash) break;
              slug = `${tenantSlugFrom(seed)}-${generateId(4).toLowerCase()}`;
            }
            const tenant = await prisma.tenant.create({ data: { name: user.name || user.email, slug } });
            await prisma.user.update({ where: { id: user.id }, data: { tenantId: tenant.id, role: Role.ADMIN } });
          } catch (e) {
            console.error("[auth] tenant auto-provision failed:", e instanceof Error ? e.message : String(e));
          }
        },
      },
    },
  },
  // Must be last: lets Server Actions set auth cookies in Next.js.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

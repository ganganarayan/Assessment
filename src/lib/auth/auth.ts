import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

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
  // Must be last: lets Server Actions set auth cookies in Next.js.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

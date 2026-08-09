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
  /**
   * Trusted origins for the CSRF/origin check. Beyond the app's own URL + the root
   * domain (and its subdomains), a tenant admin may sign in on their OWN custom
   * domain — so if the request's origin is a VERIFIED custom domain in our Domain
   * table, trust it too. Without this, sign-in from a custom domain is rejected with
   * "Invalid origin" before the password is ever checked.
   */
  trustedOrigins: async (request) => {
    const root = env.NEXT_PUBLIC_ROOT_DOMAIN;
    const list = [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL, `https://${root}`, `https://*.${root}`].filter(
      (v): v is string => !!v,
    );
    const origin = request?.headers.get("origin");
    if (origin) {
      try {
        const host = new URL(origin).host.toLowerCase();
        // Trust any registered custom domain (the request reaching us means it already
        // routes here) — don't gate on the `verified` flag, which can be stale.
        const d = await prisma.domain.findUnique({ where: { hostname: host }, select: { id: true } });
        if (d) list.push(origin);
      } catch {
        /* malformed origin — ignore */
      }
    }
    return list;
  },
  emailAndPassword: {
    enabled: true,
    // requireEmailVerification stays OFF for now (no mail system yet) so signup logs
    // in directly. Flip to true once EMAIL_VERIFY_WEBHOOK_URL is live to enforce it.
    // Password reset: the link is valid for 10 minutes.
    resetPasswordTokenExpiresIn: 600,
    // Delegate the reset email to the owner's CRM (same pattern as verification):
    // POST the reset link to the configured webhook; the CRM emails the user, who
    // clicks it and lands on /reset-password. URL from the super-admin Settings field
    // (AppSetting singleton), falling back to PASSWORD_RESET_WEBHOOK_URL (env).
    sendResetPassword: async ({ user, url, token }) => {
      const row = await prisma.appSetting
        .findUnique({ where: { id: "singleton" }, select: { passwordResetWebhookUrl: true } })
        .catch(() => null);
      const hook = row?.passwordResetWebhookUrl?.trim() || env.PASSWORD_RESET_WEBHOOK_URL;
      if (!hook) {
        console.error("[auth] password-reset requested but no webhook configured");
        return;
      }
      try {
        await fetch(hook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "password_reset", email: user.email, name: user.name, reset_url: url, token }),
          signal: AbortSignal.timeout(8000),
        });
      } catch (e) {
        console.error("[auth] password-reset webhook failed:", e instanceof Error ? e.message : String(e));
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Delegate the actual email to the owner's CRM: POST the verification link to a
    // configurable webhook (their automation sends the email; the user clicks it and
    // Better Auth verifies + redirects). No-op until EMAIL_VERIFY_WEBHOOK_URL is set.
    sendVerificationEmail: async ({ user, url, token }) => {
      const hook = env.EMAIL_VERIFY_WEBHOOK_URL;
      if (!hook) return;
      try {
        await fetch(hook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "email_verification",
            email: user.email,
            name: user.name,
            verify_url: url,
            token,
          }),
          signal: AbortSignal.timeout(8000),
        });
      } catch (e) {
        console.error("[auth] email-verify webhook failed:", e instanceof Error ? e.message : String(e));
      }
    },
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
      // NULL = full-access owner/admin; "VIEW"/"EDIT" = staff. Surfaced on the
      // session so guards can gate reads (VIEW) vs. mutations (EDIT/owner).
      staffPermission: {
        type: "string",
        required: false,
        input: false,
      },
      // TRUE = a super admin set the password; the app forces a change on next login.
      mustChangePassword: {
        type: "boolean",
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

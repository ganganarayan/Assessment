import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { Prisma, Role } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { isPlatformOwner } from "@/lib/auth/platform";
import { generateId } from "@/lib/ids";
import { ATTR_COOKIE } from "@/lib/attribution";
import { normalizeAttribution } from "@/lib/events/payload";
import { sendEmail } from "@/lib/nurture/send";

/**
 * Read the last-touch UTM attribution cookie (set in middleware) and shape it for a
 * Tenant create — the ad/campaign a self-serve signup came from. Best-effort: returns
 * {} when there is no cookie / it is malformed, so provisioning never breaks.
 */
async function readAcquisitionAttribution(): Promise<{
  acquisitionAttribution?: Prisma.InputJsonValue;
  acqUtmSource?: string | null;
  acqUtmMedium?: string | null;
  acqUtmCampaign?: string | null;
  acqUtmTerm?: string | null;
  acqUtmContent?: string | null;
}> {
  try {
    const raw = (await cookies()).get(ATTR_COOKIE)?.value;
    if (!raw) return {};
    const attr = normalizeAttribution(JSON.parse(raw));
    if (!attr) return {};
    return {
      acquisitionAttribution: attr as unknown as Prisma.InputJsonValue,
      acqUtmSource: attr.utm_source ?? null,
      acqUtmMedium: attr.utm_medium ?? null,
      acqUtmCampaign: attr.utm_campaign ?? null,
      acqUtmTerm: attr.utm_term ?? null,
      acqUtmContent: attr.utm_content ?? null,
    };
  } catch {
    return {};
  }
}

/** Minimal branded HTML for the password-reset email (link valid ~10 min). */
function resetPasswordEmailHtml(name: string | null | undefined, url: string): string {
  const hi = name ? `Hi ${name},` : "Hi,";
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111">
    <p>${hi}</p>
    <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in about 10 minutes.</p>
    <p style="margin:24px 0">
      <a href="${url}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Reset password</a>
    </p>
    <p style="font-size:13px;color:#555">If the button doesn't work, paste this link into your browser:<br>
      <a href="${url}">${url}</a></p>
    <p style="font-size:13px;color:#555">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}

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
    // Send the reset email NATIVELY via SMTP (no CRM dependency). Resolve the
    // sender from the user's own tenant SMTP; the platform owner / super admin
    // (tenantId null) uses the singleton SMTP row. If SMTP is unconfigured or the
    // send fails, fall back to the legacy CRM webhook so we never silently drop it.
    sendResetPassword: async ({ user, url, token }) => {
      // The user's tenant decides which SMTP config sends the mail.
      const row = await prisma.user
        .findUnique({ where: { id: user.id }, select: { tenantId: true } })
        .catch(() => null);
      const tenantId = row?.tenantId ?? null;

      const smtpErr = await sendEmail(
        tenantId,
        user.email,
        "Reset your password",
        resetPasswordEmailHtml(user.name, url),
      );
      if (!smtpErr) return; // sent via SMTP

      console.error("[auth] SMTP reset email failed, trying webhook fallback:", smtpErr);
      const setting = await prisma.appSetting
        .findUnique({ where: { id: "singleton" }, select: { passwordResetWebhookUrl: true } })
        .catch(() => null);
      const hook = setting?.passwordResetWebhookUrl?.trim() || env.PASSWORD_RESET_WEBHOOK_URL;
      if (!hook) {
        console.error("[auth] password-reset: SMTP unavailable and no webhook configured");
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
            // Stamp acquisition attribution (the ad/campaign this signup came from)
            // from the last-touch UTM cookie set in middleware, so every tenant is
            // traceable to its source. Best-effort — never blocks provisioning.
            const acq = await readAcquisitionAttribution();
            const tenant = await prisma.tenant.create({
              data: { name: user.name || user.email, slug, ...acq },
            });
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

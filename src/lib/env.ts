import { z } from "zod";

/**
 * Centralised, validated environment access.
 * Importing `env` fails fast at boot if required variables are missing,
 * so no module ever reads `process.env` directly.
 */
const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().url(),

  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),

  // Cloudflare R2 is OPTIONAL in Phase 1. The app must boot without it; these
  // are only required when a storage operation is actually invoked (validated
  // lazily in lib/storage/r2.ts). Do not make them required here.
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Meta Conversions API (server-side events). ALL optional: when the access
  // token is unset the CAPI sender is a no-op, so the app boots and the browser
  // pixel still works. META_DATASET_ID defaults to NEXT_PUBLIC_META_PIXEL_ID.
  META_CAPI_ACCESS_TOKEN: z.string().min(1).optional(),
  META_DATASET_ID: z.string().min(1).optional(),
  META_GRAPH_API_VERSION: z.string().min(1).default("v21.0"),
  META_CAPI_TEST_EVENT_CODE: z.string().min(1).optional(),

  // Razorpay payments. ALL optional: when the keys are unset, the payment module
  // is a no-op and paid assessments fall back to the static payment link. Set on
  // Railway per-env (rzp_test_… on staging, rzp_live_… on prod).
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Email verification is delegated to the owner's CRM: on signup, the verification
  // link is POSTed to this webhook (their automation sends the email + confirms).
  // Unset => no email is sent (verification not enforced yet). Set it, then flip
  // requireEmailVerification on in auth.ts, to enforce verify-before-login.
  EMAIL_VERIFY_WEBHOOK_URL: z.string().url().optional(),
  // Reserved for the future Starter/Pro tiers — leave unset for now.
  RAZORPAY_PLAN_ID_STARTER: z.string().min(1).optional(),
  RAZORPAY_PLAN_ID_PRO: z.string().min(1).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  // Meta (Facebook) Pixel id. Optional — when unset, no pixel is injected.
  // NEXT_PUBLIC_* is inlined at BUILD time, so a rebuild is needed after setting it.
  NEXT_PUBLIC_META_PIXEL_ID: z.string().min(1).optional(),
});

// Public vars must be referenced statically for Next.js inlining.
const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
});

// Server vars are only validated on the server (never bundled to the client).
const isServer = typeof window === "undefined";
const serverEnv = isServer
  ? serverSchema.parse(process.env)
  : ({} as z.infer<typeof serverSchema>);

export const env = { ...serverEnv, ...publicEnv };

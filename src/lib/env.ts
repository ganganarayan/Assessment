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

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// Public vars must be referenced statically for Next.js inlining.
const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

// Server vars are only validated on the server (never bundled to the client).
const isServer = typeof window === "undefined";
const serverEnv = isServer
  ? serverSchema.parse(process.env)
  : ({} as z.infer<typeof serverSchema>);

export const env = { ...serverEnv, ...publicEnv };

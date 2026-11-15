import "server-only";
import { createHmac } from "crypto";
import { env } from "@/lib/env";

/**
 * The IndexNow key. Derived from the auth secret rather than stored, so it is stable across
 * deploys, needs no setting and no env var, and differs between staging and production.
 * It is public by design: every search engine reads it from /indexnow.txt.
 */
export function indexNowKey(): string {
  return createHmac("sha256", `assess360-indexnow:${env.BETTER_AUTH_SECRET}`).update("key").digest("hex").slice(0, 32);
}

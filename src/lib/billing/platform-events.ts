import "server-only";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { sendAndLogPlatformCapi } from "@/lib/meta/capi-log";
import { getMetaRequestContext } from "@/lib/meta/request-context";

/**
 * Assess360 SaaS-funnel CAPI events, fired on the PLATFORM pixel (separate from the
 * Gita assessment pixel). Every send is LOGGED to the CAPI log with Meta's own response
 * (scope "platform"), so a signup or subscription that reached Meta can no longer be
 * missing from the app's own numbers. Fail-soft — the logger never throws, so neither
 * signup nor checkout is ever blocked by tracking.
 * Each returns the eventId used, so the browser pixel can fire the SAME event with it
 * (Meta dedups on event_name + event_id).
 */

const SOURCE_URL = `${env.NEXT_PUBLIC_APP_URL}/`;

/** CompleteRegistration — a free sign-up. */
export async function firePlatformRegistration(input: { email: string | null; eventId?: string }): Promise<string> {
  const eventId = input.eventId ?? randomUUID();
  const ctx = await getMetaRequestContext().catch(() => ({}) as Awaited<ReturnType<typeof getMetaRequestContext>>);
  // Awaited, not fire-and-forget: the send has to be recorded before this returns, or
  // the signup is invisible in the Conversions log exactly as it was before.
  await sendAndLogPlatformCapi(
    {
      eventName: "CompleteRegistration",
      eventId,
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/sign-up`,
      user: { email: input.email ?? null, ...ctx },
      customData: { content_name: "Assess360 signup" },
    },
    { name: null },
  );
  return eventId;
}

/** Purchase — a subscription activated. value in USD; eventId = the Razorpay payment
 *  id so verify, the webhook, and the browser pixel all dedup to one Purchase. */
export async function firePlatformPurchase(input: {
  email: string | null;
  phone?: string | null;
  value: number;
  eventId: string;
  planLabel?: string;
}): Promise<void> {
  const ctx = await getMetaRequestContext().catch(() => ({}) as Awaited<ReturnType<typeof getMetaRequestContext>>);
  await sendAndLogPlatformCapi(
    {
      eventName: "Purchase",
      eventId: input.eventId,
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/w/billing`,
      user: { email: input.email ?? null, phone: input.phone ?? null, ...ctx },
      customData: { value: input.value, currency: "USD", content_name: input.planLabel ?? "Assess360 subscription" },
    },
    // value is USD; amountPaise is the rupee-paise column, so it stays null here and
    // the log shows the plan label rather than a wrong currency amount.
    { name: input.planLabel ?? null, currency: "USD", providerPaymentId: input.eventId },
  );
}

// Keep SOURCE_URL referenced for callers that want the canonical funnel origin.
export const PLATFORM_FUNNEL_ORIGIN = SOURCE_URL;

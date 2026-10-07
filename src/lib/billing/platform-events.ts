import "server-only";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { sendAndLogPlatformCapi } from "@/lib/meta/capi-log";
import { getMetaRequestContext } from "@/lib/meta/request-context";

/**
 * Assess360 SaaS-funnel CAPI events, fired on the PLATFORM pixel (separate from the
 * Gita assessment pixel). Every send is LOGGED to the CAPI log with Meta's own response
 * (scope "platform"), so a signup or subscription that reached Meta can no longer be
 * missing from the app's own numbers. Fail-soft - the logger never throws, so neither
 * signup nor checkout is ever blocked by tracking.
 * Each returns the eventId used, so the browser pixel can fire the SAME event with it
 * (Meta dedups on event_name + event_id).
 */

const SOURCE_URL = `${env.NEXT_PUBLIC_APP_URL}/`;

/**
 * StartTrial - the workspace is live and someone has reached the app.
 *
 * This step used to fire CompleteRegistration, which the funnel opt-in already fires.
 * One pixel and two senders of one event name, seconds apart for the same person, with
 * different event ids: Meta cannot deduplicate those because they are not the same
 * event, so every lead counted twice and cost per result read 40% below the truth.
 *
 * CompleteRegistration now means one thing - someone opted in. This is the step above
 * it, and StartTrial is the standard event for exactly that, so the pixel carries a
 * real ladder: lead, trial, revenue.
 */
export async function fireStartTrial(input: { email: string | null; eventId?: string }): Promise<string> {
  const eventId = input.eventId ?? randomUUID();
  const ctx = await getMetaRequestContext().catch(() => ({}) as Awaited<ReturnType<typeof getMetaRequestContext>>);
  // Awaited, not fire-and-forget: the send has to be recorded before this returns, or
  // the trial start is invisible in the Conversions log.
  await sendAndLogPlatformCapi(
    {
      eventName: "StartTrial",
      eventId,
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/w`,
      user: { email: input.email ?? null, ...ctx },
      customData: { content_name: "Assess360 trial" },
    },
    { name: null },
  );
  return eventId;
}

/** Purchase - a subscription activated. value in USD; eventId = the Razorpay payment
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

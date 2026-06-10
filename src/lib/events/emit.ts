import { Prisma, type EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { EVENT_NAME, type EmitInput } from "@/features/events/types";
import { buildEnvelope } from "@/lib/events/payload";

/**
 * Central event service.
 *
 * Guarantees:
 *  - The EventLog row is ALWAYS written (awaited) before returning.
 *  - Webhook delivery NEVER blocks the user flow: the endpoint lookup and HTTP
 *    POST run in the background (the persistent Node server keeps the promise
 *    alive). A failed delivery is captured in WebhookLog, never thrown.
 *
 * Emitters pass a normalized EmitInput; the canonical envelope is assembled in
 * one place (lib/events/payload.ts) so every event has an identical top level.
 */
export async function emitEvent(type: EventType, input: EmitInput): Promise<void> {
  const name = EVENT_NAME[type];
  const envelope = buildEnvelope(type, input, env.NEXT_PUBLIC_APP_URL);

  // 1) Always persist the event (source of truth), awaited. Denormalized columns
  //    are derived from the same input the payload was built from.
  await prisma.eventLog.create({
    data: {
      type,
      name,
      payload: envelope as unknown as Prisma.InputJsonValue,
      source: "assess360",
      submissionId: input.submissionId ?? null,
      assessmentId: input.assessment?.id ?? null,
      leadEmail: input.lead?.email ?? null,
    },
  });

  // 2) Deliver to the ACTIVE webhook for this event name — fully non-blocking.
  void (async () => {
    const webhook = await prisma.webhook.findUnique({ where: { name } });
    if (!webhook || webhook.status !== "ACTIVE") return;
    await deliverWebhook({
      webhookId: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      eventName: name,
      body: JSON.stringify(envelope),
      submissionId: input.submissionId ?? null,
    });
  })().catch(() => {
    // Delivery failures are recorded in WebhookLog; never surface to the user.
  });
}

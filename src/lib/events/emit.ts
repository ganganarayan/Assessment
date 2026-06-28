import { Prisma, type EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { EVENT_NAME, type EmitInput } from "@/features/events/types";
import { buildEnvelope, shapePayload, withDeliveredName } from "@/lib/events/payload";

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
  // Shaped per event (lead.created drops nulls; assessment.started is minimal);
  // the SAME payload is logged and delivered, so the audit matches what was sent.
  const payload = shapePayload(type, buildEnvelope(type, input, env.NEXT_PUBLIC_APP_URL));

  // 1) Always persist the event (source of truth), awaited. Denormalized columns
  //    are derived from the same input the payload was built from.
  await prisma.eventLog.create({
    data: {
      type,
      name,
      payload: payload as unknown as Prisma.InputJsonValue,
      source: "assess360",
      submissionId: input.submissionId ?? null,
      assessmentId: input.assessment?.id ?? null,
      leadEmail: input.lead?.email ?? null,
    },
  });

  // 2) Deliver to EVERY ACTIVE webhook whose trigger is this event — non-blocking.
  //    Each delivers under its own configured name (any CRM, many CRMs per event).
  void (async () => {
    const webhooks = await prisma.webhook.findMany({ where: { eventType: type, status: "ACTIVE" } });
    await Promise.all(
      webhooks.map((webhook) =>
        deliverWebhook({
          webhookId: webhook.id,
          url: webhook.url,
          secret: webhook.secret,
          eventName: webhook.name,
          body: JSON.stringify(withDeliveredName(payload, webhook.name)),
          submissionId: input.submissionId ?? null,
        }),
      ),
    );
  })().catch(() => {
    // Delivery failures are recorded in WebhookLog; never surface to the user.
  });
}

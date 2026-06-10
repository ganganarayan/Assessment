import { EventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import {
  EVENT_NAME,
  type EmitContext,
  type EventEnvelope,
} from "@/features/events/types";

/**
 * Central event service.
 *
 * Guarantees:
 *  - The EventLog row is ALWAYS written (awaited) before returning.
 *  - Webhook delivery NEVER blocks the user flow: the endpoint lookup and HTTP
 *    POST run in the background (the persistent Node server keeps the promise
 *    alive). A failed delivery is captured in WebhookLog, never thrown.
 */
export async function emitEvent(
  type: EventType,
  data: Record<string, unknown>,
  ctx: EmitContext = {},
): Promise<void> {
  const name = EVENT_NAME[type];
  const envelope: EventEnvelope = {
    event: name,
    type,
    occurredAt: new Date().toISOString(),
    source: "assess360",
    data,
  };

  // 1) Always persist the event (source of truth), awaited.
  await prisma.eventLog.create({
    data: {
      type,
      name,
      payload: envelope as unknown as Prisma.InputJsonValue,
      source: "assess360",
      submissionId: ctx.submissionId ?? null,
      assessmentId: ctx.assessmentId ?? null,
      leadEmail: ctx.leadEmail ?? null,
    },
  });

  // 2) Dispatch to the configured endpoint — fully non-blocking.
  void (async () => {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { event: type },
    });
    if (!endpoint || !endpoint.enabled) return;
    await deliverWebhook({
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      eventName: name,
      body: JSON.stringify(envelope),
      submissionId: ctx.submissionId ?? null,
    });
  })().catch(() => {
    // Delivery failures are recorded in WebhookLog; never surface to the user.
  });
}

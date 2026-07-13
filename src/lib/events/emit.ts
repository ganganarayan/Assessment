import { Prisma, type EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { processDelivery } from "@/lib/webhooks/retry";
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

  // Resolve the owning tenant once (submission is the source of truth; Gita/platform
  // events resolve to null). Stamped on the log AND used to scope webhook delivery.
  let tenantId: string | null = null;
  if (input.submissionId) {
    const s = await prisma.submission.findUnique({
      where: { id: input.submissionId },
      select: { tenantId: true },
    });
    tenantId = s?.tenantId ?? null;
  } else {
    tenantId = input.tenant?.id ?? null;
  }

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
      tenantId,
    },
  });

  // 2) ENQUEUE a durable delivery per matching webhook (awaited, so it survives a
  //    deploy), then fire the first attempt inline — non-blocking. If that inline
  //    attempt is killed mid-flight, the pending row is retried by the cron
  //    (lib/webhooks/retry). Tenant scoping is unchanged: Gita/platform events
  //    resolve to tenantId null and fire to the null-tenant webhooks as before.
  const webhooks = await prisma.webhook.findMany({
    where: { eventType: type, status: "ACTIVE", tenantId },
    select: { id: true, name: true, url: true, secret: true },
  });
  if (webhooks.length === 0) return;

  const created = await prisma.$transaction(
    webhooks.map((webhook) =>
      prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventName: webhook.name,
          endpoint: webhook.url,
          secret: webhook.secret,
          body: JSON.stringify(withDeliveredName(payload, webhook.name)),
          submissionId: input.submissionId ?? null,
          tenantId,
        },
        select: { id: true },
      }),
    ),
  );

  void Promise.all(created.map((d) => processDelivery(d.id))).catch(() => {
    // Failures are recorded on the delivery row + WebhookLog; the cron retries.
  });
}

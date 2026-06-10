"use server";

import { revalidatePath } from "next/cache";
import { EventType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { generateWebhookSecret } from "@/lib/webhooks/sign";
import { EVENT_NAME, NAME_TO_TYPE } from "@/features/events/types";

const urlSchema = z.string().url("Enter a valid URL.").max(2000);

export async function saveWebhookEndpoint(
  event: EventType,
  url: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = urlSchema.safeParse(url);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid URL." };
  }

  await prisma.webhookEndpoint.upsert({
    where: { event },
    update: { url: parsed.data, enabled },
    create: { event, url: parsed.data, enabled, secret: generateWebhookSecret() },
  });

  revalidatePath("/admin/webhooks");
  return { ok: true };
}

export async function regenerateWebhookSecret(
  event: EventType,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const existing = await prisma.webhookEndpoint.findUnique({ where: { event } });
  if (!existing) return { ok: false, error: "Save an endpoint first." };
  await prisma.webhookEndpoint.update({
    where: { event },
    data: { secret: generateWebhookSecret() },
  });
  revalidatePath("/admin/webhooks");
  return { ok: true };
}

export async function testWebhook(
  event: EventType,
): Promise<ActionResult<{ status: number | null }>> {
  await requireSuperAdmin();
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { event } });
  if (!endpoint) return { ok: false, error: "Save an endpoint URL first." };

  const name = EVENT_NAME[event];
  const envelope = {
    event: name,
    type: event,
    occurredAt: new Date().toISOString(),
    source: "assess360" as const,
    data: { test: true, message: "Test webhook from Assess360" },
  };
  const result = await deliverWebhook({
    endpointId: endpoint.id,
    url: endpoint.url,
    secret: endpoint.secret,
    eventName: name,
    body: JSON.stringify(envelope),
  });

  revalidatePath("/admin/webhook-logs");
  return result.success
    ? { ok: true, data: { status: result.responseStatus } }
    : { ok: false, error: `Delivery failed (status ${result.responseStatus ?? "n/a"}). See Webhook Logs.` };
}

export async function retryWebhookLog(logId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const log = await prisma.webhookLog.findUnique({ where: { id: logId } });
  if (!log) return { ok: false, error: "Log not found." };

  const type = NAME_TO_TYPE[log.eventName];
  const endpoint = type
    ? await prisma.webhookEndpoint.findUnique({ where: { event: type } })
    : null;
  if (!endpoint) {
    return { ok: false, error: "No endpoint configured for this event; cannot sign retry." };
  }

  await deliverWebhook({
    endpointId: endpoint.id,
    url: log.endpoint,
    secret: endpoint.secret,
    eventName: log.eventName,
    body: JSON.stringify(log.payload),
    submissionId: log.submissionId,
    attempt: log.attemptCount + 1,
  });

  revalidatePath("/admin/webhook-logs");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EventType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { generateWebhookSecret } from "@/lib/webhooks/sign";
import { withDeliveredName } from "@/lib/events/payload";
import { ACTIVE_EVENT_TYPES, WEBHOOK_NAME_REGEX } from "@/features/events/types";

// Delivered event name: free format — lowercase, dotted OR underscore segments.
const nameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(WEBHOOK_NAME_REGEX, "Use lowercase names with . or _ , e.g. completed_paid or lead.created");
const urlSchema = z.string().url("Enter a valid URL.").max(2000);

function validTrigger(t: string): t is EventType {
  return (ACTIVE_EVENT_TYPES as string[]).includes(t);
}

export async function createWebhook(
  eventType: string,
  name: string,
  url: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  if (!validTrigger(eventType)) return { ok: false, error: "Pick a valid trigger event." };
  const n = nameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Invalid event name." };
  const u = urlSchema.safeParse(url);
  if (!u.success) return { ok: false, error: u.error.issues[0]?.message ?? "Invalid URL." };

  const existing = await prisma.webhook.findUnique({ where: { name: n.data } });
  if (existing) return { ok: false, error: "A webhook with that name already exists." };

  const created = await prisma.webhook.create({
    data: {
      eventType,
      name: n.data,
      url: u.data,
      status: active ? "ACTIVE" : "INACTIVE",
      secret: generateWebhookSecret(),
    },
    select: { id: true },
  });
  revalidatePath("/admin/webhooks");
  return { ok: true, data: { id: created.id } };
}

/**
 * Edit name + URL — allowed ONLY before the first successful delivery. After that
 * the name/url are frozen (a working CRM mapping must not silently break); create
 * a new webhook instead.
 */
export async function editWebhook(
  id: string,
  name: string,
  url: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const wh = await prisma.webhook.findUnique({ where: { id }, select: { firstDeliveredAt: true } });
  if (!wh) return { ok: false, error: "Webhook not found." };
  if (wh.firstDeliveredAt) {
    return { ok: false, error: "This webhook has delivered successfully and is locked. Create a new webhook instead." };
  }
  const n = nameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Invalid event name." };
  const u = urlSchema.safeParse(url);
  if (!u.success) return { ok: false, error: u.error.issues[0]?.message ?? "Invalid URL." };

  const clash = await prisma.webhook.findUnique({ where: { name: n.data } });
  if (clash && clash.id !== id) return { ok: false, error: "A webhook with that name already exists." };

  await prisma.webhook.update({ where: { id }, data: { name: n.data, url: u.data } });
  revalidatePath("/admin/webhooks");
  return { ok: true };
}

export async function activateWebhook(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.webhook.update({ where: { id }, data: { status: "ACTIVE" } });
  revalidatePath("/admin/webhooks");
  return { ok: true };
}

export async function deactivateWebhook(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.webhook.update({ where: { id }, data: { status: "INACTIVE" } });
  revalidatePath("/admin/webhooks");
  return { ok: true };
}

export async function purgeWebhook(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  // Permanently removes the webhook config. EventLog/WebhookLog are NOT deleted
  // (no FK to logs), so history is preserved forever.
  await prisma.webhook.delete({ where: { id } });
  revalidatePath("/admin/webhooks");
  return { ok: true };
}

/**
 * Re-fire an event's webhook delivery to all ACTIVE webhooks for that event's
 * trigger, using the original event payload (each delivered under its own name).
 */
export async function retryEvent(eventLogId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const ev = await prisma.eventLog.findUnique({ where: { id: eventLogId } });
  if (!ev) return { ok: false, error: "Event not found." };

  const webhooks = await prisma.webhook.findMany({
    where: { eventType: ev.type, status: "ACTIVE" },
  });
  if (webhooks.length === 0) {
    return { ok: false, error: "Retry needs an active webhook for this event." };
  }

  const basePayload = (ev.payload ?? {}) as Record<string, unknown>;
  for (const webhook of webhooks) {
    const last = ev.submissionId
      ? await prisma.webhookLog.findFirst({
          where: { submissionId: ev.submissionId, eventName: webhook.name },
          orderBy: { attemptCount: "desc" },
          select: { attemptCount: true },
        })
      : null;
    await deliverWebhook({
      webhookId: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      eventName: webhook.name,
      body: JSON.stringify(withDeliveredName(basePayload, webhook.name)),
      submissionId: ev.submissionId,
      attempt: (last?.attemptCount ?? 0) + 1,
    });
  }

  revalidatePath("/admin/webhook-logs");
  return { ok: true };
}

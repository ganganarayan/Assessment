"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { generateWebhookSecret } from "@/lib/webhooks/sign";
import { EMITTED_EVENT_NAMES } from "@/features/events/types";

// Event names: immutable + unique. Lowercase, dotted (e.g. lead.created).
const nameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(\.[a-z0-9_]+)+$/, "Use lowercase dotted names, e.g. domain.event");
const urlSchema = z.string().url("Enter a valid URL.").max(2000);

export async function createWebhook(
  name: string,
  url: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  const n = nameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Invalid event name." };
  // Only events the app actually emits can be subscribed to — this rejects typos
  // (e.g. "aeeseement.completed") that would otherwise never deliver.
  if (!EMITTED_EVENT_NAMES.includes(n.data)) {
    return {
      ok: false,
      error: `Unknown event "${n.data}". Valid events: ${EMITTED_EVENT_NAMES.join(", ")}.`,
    };
  }
  const u = urlSchema.safeParse(url);
  if (!u.success) return { ok: false, error: u.error.issues[0]?.message ?? "Invalid URL." };

  const existing = await prisma.webhook.findUnique({ where: { name: n.data } });
  if (existing) return { ok: false, error: "An event with that name already exists." };

  const created = await prisma.webhook.create({
    data: {
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
 * Re-fire an event's webhook delivery using the original event payload.
 * Only allowed while an ACTIVE webhook exists for that event name.
 */
export async function retryEvent(eventLogId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const ev = await prisma.eventLog.findUnique({ where: { id: eventLogId } });
  if (!ev) return { ok: false, error: "Event not found." };

  const webhook = await prisma.webhook.findUnique({ where: { name: ev.name } });
  if (!webhook || webhook.status !== "ACTIVE") {
    return { ok: false, error: "Retry is only possible for active webhooks." };
  }

  const last = ev.submissionId
    ? await prisma.webhookLog.findFirst({
        where: { submissionId: ev.submissionId, eventName: ev.name },
        orderBy: { attemptCount: "desc" },
        select: { attemptCount: true },
      })
    : null;

  await deliverWebhook({
    webhookId: webhook.id,
    url: webhook.url,
    secret: webhook.secret,
    eventName: ev.name,
    body: JSON.stringify(ev.payload),
    submissionId: ev.submissionId,
    attempt: (last?.attemptCount ?? 0) + 1,
  });

  revalidatePath("/admin/webhook-logs");
  return { ok: true };
}

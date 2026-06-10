"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { deliverWebhook } from "@/lib/webhooks/dispatch";
import { generateWebhookSecret } from "@/lib/webhooks/sign";

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

/** Re-fire a failed delivery — only allowed while the webhook is ACTIVE. */
export async function retryWebhookLog(logId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const log = await prisma.webhookLog.findUnique({ where: { id: logId } });
  if (!log) return { ok: false, error: "Log not found." };

  const webhook = await prisma.webhook.findUnique({ where: { name: log.eventName } });
  if (!webhook || webhook.status !== "ACTIVE") {
    return { ok: false, error: "Retry is only possible for active webhooks." };
  }

  await deliverWebhook({
    webhookId: webhook.id,
    url: webhook.url,
    secret: webhook.secret,
    eventName: log.eventName,
    body: JSON.stringify(log.payload),
    submissionId: log.submissionId,
    attempt: log.attemptCount + 1,
  });

  revalidatePath("/admin/webhook-logs");
  return { ok: true };
}

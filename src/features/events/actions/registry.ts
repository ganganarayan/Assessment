"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { PRODUCT } from "@/features/events/types";

// Namespaced, lowercase, dotted event names — immutable once created.
const nameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(
    /^[a-z0-9]+(\.[a-z0-9_]+)+$/,
    "Use lowercase dotted names, e.g. domain.event_name",
  );

export async function createEvent(name: string): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid event name." };
  }

  const existing = await prisma.event.findUnique({
    where: { product_name: { product: PRODUCT, name: parsed.data } },
  });
  if (existing) return { ok: false, error: "An event with that name already exists." };

  const created = await prisma.event.create({
    data: { product: PRODUCT, name: parsed.data, status: "ACTIVE", builtIn: false },
    select: { id: true },
  });
  revalidatePath("/admin/events");
  return { ok: true, data: { id: created.id } };
}

export async function activateEvent(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const e = await prisma.event.findUnique({ where: { id }, select: { status: true } });
  if (!e) return { ok: false, error: "Event not found." };
  if (e.status !== "DEACTIVATED") {
    return { ok: false, error: "Only deactivated events can be activated." };
  }
  await prisma.event.update({ where: { id }, data: { status: "ACTIVE" } });
  revalidatePath("/admin/events");
  return { ok: true };
}

export async function deactivateEvent(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const e = await prisma.event.findUnique({ where: { id }, select: { status: true } });
  if (!e) return { ok: false, error: "Event not found." };
  if (e.status !== "ACTIVE") {
    return { ok: false, error: "Only active events can be deactivated." };
  }
  await prisma.event.update({ where: { id }, data: { status: "DEACTIVATED" } });
  revalidatePath("/admin/events");
  return { ok: true };
}

export async function purgeEvent(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const e = await prisma.event.findUnique({ where: { id }, select: { status: true } });
  if (!e) return { ok: false, error: "Event not found." };
  if (e.status !== "DEACTIVATED") {
    return { ok: false, error: "Deactivate the event before purging." };
  }
  // Terminal, not retrievable. EventLog/WebhookLog history is preserved.
  await prisma.event.update({ where: { id }, data: { status: "PURGED" } });
  revalidatePath("/admin/events");
  return { ok: true };
}

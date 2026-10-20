"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { contactTenantOf } from "@/lib/contacts/upsert";
import { featureDenied } from "@/lib/features/release";
import { countAudience } from "@/lib/broadcasts/audience";
import { cancelBroadcast } from "@/lib/broadcasts/run";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  audienceSchema,
  createBroadcastSchema,
  saveBroadcastSchema,
  scheduleProblems,
  scheduleSchema,
} from "@/features/broadcasts/types";

/**
 * Editing and scheduling broadcasts.
 *
 * The one rule running through all of it: a broadcast that is SENDING or SENT is not
 * editable. Changing the words of something half delivered would mean two different
 * messages went out under one name, and the log would be unable to say which person
 * got which.
 */

type Scoped = { ok: true; tenantId: string } | { ok: false; result: ActionResult };

async function scoped(): Promise<Scoped> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return { ok: false, result: denied };
  if (!scope.tenantId && !scope.isSuper) return { ok: false, result: { ok: false, error: "No workspace." } };
  const held = await featureDenied("broadcasts", scope.tenantId);
  if (held) return { ok: false, result: held };
  return { ok: true, tenantId: contactTenantOf(scope.tenantId) };
}

function refresh(id?: string) {
  revalidatePath("/admin/broadcasts");
  revalidatePath("/w/broadcasts");
  if (id) {
    revalidatePath(`/admin/broadcasts/${id}`);
    revalidatePath(`/w/broadcasts/${id}`);
  }
}

/**
 * Editable means DRAFT or SCHEDULED. Anything further along is a record, not a draft:
 * changing the words of something half delivered would put two different messages out
 * under one name, and the log could not say who got which.
 *
 * A tagged union rather than probing for a key, because "does this object have an
 * error property" narrows badly and the compiler is right to object.
 */
type Editable = { ok: true } | { ok: false; error: string };

async function editable(tenantId: string, id: string): Promise<Editable> {
  const b = await prisma.broadcast.findFirst({ where: { id, tenantId }, select: { id: true, status: true } });
  if (!b) return { ok: false, error: "That broadcast is not in this workspace." };
  if (b.status !== "DRAFT" && b.status !== "SCHEDULED") {
    return { ok: false, error: "It has already started going out, so it cannot be changed." };
  }
  return { ok: true };
}

export async function createBroadcast(input: unknown): Promise<ActionResult<{ id: string }>> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const parsed = createBroadcastSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the name." };
  const b = await prisma.broadcast.create({
    data: { tenantId: s.tenantId, name: parsed.data.name, channel: parsed.data.channel },
    select: { id: true },
  });
  refresh();
  return { ok: true, data: { id: b.id } };
}

export async function saveBroadcast(input: unknown): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const parsed = saveBroadcastSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const v = parsed.data;
  const chk = await editable(s.tenantId, v.id);
  if (!chk.ok) return { ok: false, error: chk.error };

  await prisma.broadcast.update({
    where: { id: v.id },
    data: {
      name: v.name,
      subject: v.subject,
      body: v.body,
      wabaTemplate: v.wabaTemplate,
      wabaLang: v.wabaLang || "en",
      wabaVars: v.wabaVars,
      audience: v.audience,
      ratePerMinute: v.ratePerMinute,
    },
  });
  refresh(v.id);
  return { ok: true };
}

/** How many people this would reach right now. The number shown before committing. */
export async function previewAudience(input: unknown, channel: "EMAIL" | "WABA"): Promise<ActionResult<{ count: number }>> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const parsed = audienceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That filter is not valid." };
  const count = await countAudience(s.tenantId, parsed.data, channel);
  return { ok: true, data: { count } };
}

/**
 * Book it in.
 *
 * The recipients are NOT written here. They are written when the send actually starts,
 * so a broadcast scheduled for next Tuesday reaches the people who match next Tuesday
 * rather than the people who matched when somebody pressed the button - while still
 * freezing from the moment it begins.
 */
export async function scheduleBroadcast(input: unknown): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pick a time." };
  const { id, scheduledAt } = parsed.data;

  const chk = await editable(s.tenantId, id);
  if (!chk.ok) return { ok: false, error: chk.error };

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "That is not a valid time." };

  const b = await prisma.broadcast.findUnique({
    where: { id },
    select: { channel: true, subject: true, body: true, wabaTemplate: true },
  });
  if (!b) return { ok: false, error: "That broadcast is not in this workspace." };
  const problems = scheduleProblems({
    channel: b.channel,
    subject: b.subject ?? "",
    body: b.body ?? "",
    wabaTemplate: b.wabaTemplate ?? "",
  });
  if (problems.length) return { ok: false, error: problems.join(" ") };

  await prisma.broadcast.update({
    where: { id },
    data: { status: "SCHEDULED", scheduledAt: when },
  });
  refresh(id);
  return { ok: true };
}

/** Put it back to a draft. Only possible before it starts. */
export async function unscheduleBroadcast(id: string): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const owned = await prisma.broadcast.findFirst({
    where: { id, tenantId: s.tenantId, status: "SCHEDULED" },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "It is not scheduled, so there is nothing to call off." };
  await prisma.broadcast.update({ where: { id }, data: { status: "DRAFT", scheduledAt: null } });
  refresh(id);
  return { ok: true };
}

/**
 * Stop one that is already going out.
 *
 * Never refused for a broadcast in flight: stopping something is not a privilege, and
 * the moment somebody wants to stop a send is the moment every second counts. What has
 * gone has gone; the rest is marked stopped so the log says so plainly.
 */
export async function stopBroadcast(id: string): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const owned = await prisma.broadcast.findFirst({
    where: { id, tenantId: s.tenantId, status: { in: ["SCHEDULED", "SENDING"] } },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "It is not sending, so there is nothing to stop." };
  await cancelBroadcast(id);
  refresh(id);
  return { ok: true };
}

export async function deleteBroadcast(id: string): Promise<ActionResult> {
  const s = await scoped();
  if (!s.ok) return s.result;
  const owned = await prisma.broadcast.findFirst({
    where: { id, tenantId: s.tenantId },
    select: { id: true, status: true },
  });
  if (!owned) return { ok: false, error: "That broadcast is not in this workspace." };
  if (owned.status === "SENDING") return { ok: false, error: "Stop it before deleting it." };
  await prisma.broadcast.delete({ where: { id } });
  refresh();
  return { ok: true };
}

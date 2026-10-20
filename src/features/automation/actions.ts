"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { automationSchema } from "@/features/automation/schemas";
import { fillPlaceholders } from "@/features/nurture/config";
import { sendEmail } from "@/lib/nurture/send";
import { formatIST, formatISTDate } from "@/lib/date";

/**
 * The automation builder's actions: save a rule, delete one, and send yourself a test
 * of what it would say.
 *
 * Same scope contract as the calendar: the ACTING workspace, a view-only staff member
 * cannot mutate, and every id is checked against that workspace before it is touched.
 */

function refresh() {
  revalidatePath("/admin/automations");
  revalidatePath("/w/automations");
}

async function editor(): Promise<{ tenantId: string } | { error: string }> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return { error: denied.error };
  return { tenantId: configTenantOf(scope) };
}

/**
 * Create or replace one automation.
 *
 * The actions are REPLACED rather than diffed: they are an ordered list the owner edits
 * as a whole, their ids are never referenced from anywhere else (a run points at the
 * automation, not at an action), and diffing a list of five rows by hand is how an
 * ordering bug gets written. Done in a transaction so a rule is never left with the old
 * actions deleted and the new ones not yet written.
 */
export async function saveAutomation(
  input: unknown,
  automationId?: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = automationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details are not valid." };
  }
  const v = parsed.data;

  if (v.bookingTypeId) {
    const owned = await prisma.bookingType.findFirst({
      where: { id: v.bookingTypeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "That booking link is not in this workspace." };
  }

  const base = {
    name: v.name,
    trigger: v.trigger,
    bookingTypeId: v.bookingTypeId || null,
    // Only a reminder has a time of its own; the rest fire when their event does, and
    // storing an offset for them would be a number that looks like it does something.
    offsetMin: v.trigger === "APPOINTMENT_REMINDER" ? v.offsetMin : 0,
    active: v.active,
  };
  const fields = (a: (typeof v.actions)[number], i: number) => ({
    displayOrder: i,
    channel: a.channel,
    subject: a.channel === "EMAIL" ? a.subject : null,
    body: a.channel === "EMAIL" ? a.body : null,
    wabaTemplate: a.channel === "WABA" ? a.wabaTemplate : null,
    wabaLang: a.wabaLang || "en",
    wabaVars: a.channel === "WABA" ? a.wabaVars : [],
  });

  if (automationId) {
    const existing = await prisma.automation.findFirst({
      where: { id: automationId, tenantId: auth.tenantId },
      select: { id: true, actions: { select: { id: true } } },
    });
    if (!existing) return { ok: false, error: "That automation is not in this workspace." };

    // Only ids that really belong to THIS automation count as an update; anything else
    // arriving in the form is treated as a new message rather than trusted as a target.
    const owned = new Set(existing.actions.map((a) => a.id));
    const keep = v.actions.map((a) => (a.id && owned.has(a.id) ? a.id : null));

    /**
     * Updated in place, not replaced.
     *
     * Each message keeps its row, so its lifetime counters and its 30 days of sends stay
     * attached to it through every edit. A message REMOVED from the form is deleted, and
     * its statistics go with it - which is right: the message is gone.
     */
    await prisma.$transaction([
      prisma.automationAction.deleteMany({
        where: { automationId, id: { notIn: keep.filter((id): id is string => id !== null) } },
      }),
      prisma.automation.update({ where: { id: automationId }, data: base }),
      ...v.actions.map((a, i) => {
        const id = keep[i];
        return id
          ? prisma.automationAction.update({ where: { id }, data: fields(a, i) })
          : prisma.automationAction.create({ data: { automationId, ...fields(a, i) } });
      }),
    ]);
    refresh();
    return { ok: true, data: { id: automationId } };
  }

  const created = await prisma.automation.create({
    data: { ...base, tenantId: auth.tenantId, actions: { create: v.actions.map(fields) } },
    select: { id: true },
  });
  refresh();
  return { ok: true, data: { id: created.id } };
}

/**
 * Delete a rule. Its queued runs go with it (the relation cascades), which is the
 * intent: a reminder belonging to a rule that no longer exists has nothing to say.
 */
export async function deleteAutomation(automationId: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "That automation is not in this workspace." };
  await prisma.automation.delete({ where: { id: automationId } });
  refresh();
  return { ok: true };
}

/** Switch a rule on or off without opening it. Off stops tomorrow's reminders too,
 *  because the worker re-reads the rule when a run comes due. */
export async function setAutomationActive(automationId: string, active: boolean): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };
  const updated = await prisma.automation.updateMany({
    where: { id: automationId, tenantId: auth.tenantId },
    data: { active },
  });
  if (updated.count === 0) return { ok: false, error: "That automation is not in this workspace." };
  refresh();
  return { ok: true };
}

/**
 * Send yourself what this rule would say, filled in with sample values.
 *
 * EMAIL ONLY, and that is not an oversight: a WhatsApp business-initiated message can
 * only be an approved template, so what arrives is decided by Meta's copy of it and not
 * by anything typed here. The template picker already shows that text, and a test send
 * would spend a real conversation to show it again.
 */
export async function sendAutomationTest(automationId: string, to: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const dest = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
    return { ok: false, error: "Enter a valid email address to send the test to." };
  }

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, tenantId: auth.tenantId },
    include: { actions: { orderBy: { displayOrder: "asc" } } },
  });
  if (!automation) return { ok: false, error: "That automation is not in this workspace." };

  const emails = automation.actions.filter((a) => a.channel === "EMAIL");
  if (emails.length === 0) {
    return { ok: false, error: "This automation sends no email, so there is nothing to preview." };
  }

  // Sample values, obviously sample. A test that renders real-looking details invites
  // the reader to check them, which is not what they are being asked to look at.
  const inAnHour = new Date(Date.now() + 60 * 60_000);
  const lead = {
    firstName: "Sample",
    lastName: "Lead",
    email: dest,
    mobile: "+919999999999",
    profession: "Business Owner",
  };
  const extra: Record<string, string> = {
    appointmentTime: formatIST(inAnHour).slice(11),
    appointmentDate: formatISTDate(inAnHour),
    bookingName: "30-minute strategy call",
    meetingLink: "https://example.com/meet/sample",
    bookingUrl: "https://example.com/b/sample",
    icsUrl: "https://example.com/appointment.ics",
  };

  for (const action of emails) {
    const err = await sendEmail(
      auth.tenantId,
      dest,
      `[Test] ${fillPlaceholders(action.subject ?? "", lead, extra)}`,
      fillPlaceholders(action.body ?? "", lead, extra),
    );
    if (err) return { ok: false, error: err };
  }
  return { ok: true };
}

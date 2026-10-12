"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type SupportKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { resolveSupportRouting } from "@/lib/support/config";
import { forwardToInbox, postSupportWebhook, requestFacts, threadUrl } from "@/lib/support/notify";
import { replyPayload, type SupportRequestFacts } from "@/lib/support/payload";
import { SUPPORT_MODES, SUPPORT_TOPICS, type SupportMode } from "@/lib/support/model";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The switch: how each queue is handled.
 *
 * This exists because in-app support stops scaling before the product does. The owner
 * answers every thread at ten tenants and cannot at two hundred, and the thing that
 * breaks first is the badge: a number nobody can clear is a number nobody looks at.
 * EMAIL hands one queue to a support team while the other stays in-app, and OFF closes
 * the form without hiding the threads that are already open.
 */

const settingsSchema = z.object({
  support: z.enum(SUPPORT_MODES),
  onboarding: z.enum(SUPPORT_MODES),
  inboxEmail: z.string().trim().max(200),
  webhookUrl: z.string().trim().max(500),
});

export interface SupportSettingsView {
  support: SupportMode;
  onboarding: SupportMode;
  inboxEmail: string;
  webhookUrl: string;
}

export async function getSupportSettings(): Promise<SupportSettingsView> {
  await requireSuperAdmin();
  const r = await resolveSupportRouting();
  return {
    support: r.support,
    onboarding: r.onboarding,
    inboxEmail: r.inboxEmail ?? "",
    webhookUrl: r.webhookUrl ?? "",
  };
}

/**
 * Forward every thread of this kind that is still open and has never been forwarded.
 *
 * 🟡 This is what stops a mode switch stranding work. Flip to EMAIL with twelve open
 * threads and, without this, the badge disappears while nobody has been emailed: twelve
 * customers waiting on an answer that is no longer on anybody's screen.
 *
 * forwardedAt is the once-guard, so flipping back and forth does not send the same
 * thread twice, and the count returned is reported on the screen rather than assumed.
 */
async function forwardOpenThreads(kind: SupportKind, inbox: string): Promise<number> {
  const rows = await prisma.supportRequest.findMany({
    where: {
      kind,
      forwardedAt: null,
      status: { in: ["OPEN", "AWAITING_US", "AWAITING_TENANT"] },
      tenant: { deletedAt: null },
    },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { authorRole: true, authorName: true, body: true, createdAt: true, isInternal: true },
      },
    },
    take: 200,
  });

  let sentCount = 0;
  for (const r of rows) {
    const facts = await requestFacts(r.id);
    if (!facts) continue;
    const sent = await forwardToInbox(facts, r.messages, inbox);
    if (sent !== "SENT") continue;
    await prisma.supportRequest
      .update({ where: { id: r.id }, data: { status: "FORWARDED", forwardedAt: new Date() } })
      .catch(() => {});
    sentCount += 1;
  }
  return sentCount;
}

export async function updateSupportSettings(input: {
  support: string;
  onboarding: string;
  inboxEmail: string;
  webhookUrl: string;
}): Promise<ActionResult<{ forwarded: number }>> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings." };
  const v = parsed.data;

  const wantsEmail = v.support === "EMAIL" || v.onboarding === "EMAIL";
  const inbox = v.inboxEmail;
  if (wantsEmail) {
    // 🔴 A forward with nowhere to go is a black hole: the tenant is told their request
    // moved to email and it moved nowhere at all.
    if (!inbox) return { ok: false, error: "Email mode needs a support inbox address, or requests forward nowhere." };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inbox)) return { ok: false, error: "That is not an email address." };
  }

  const before = await resolveSupportRouting();

  // 🔴 https only, and a real URL. A webhook saved as "paste it here" or over plain
  // http would carry a customer's name, email and phone number to wherever that
  // resolved, and the failure is silent: the reply still sends, the CRM just never
  // hears, so nobody finds out until a customer says nobody told them.
  if (v.webhookUrl) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(v.webhookUrl);
    } catch {
      parsed = null;
    }
    if (!parsed) return { ok: false, error: "That is not a URL. Paste the full address, starting https://" };
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "The webhook must be https. It carries a customer's name, email and phone." };
    }
  }

  const data = {
    supportMode: v.support,
    onboardingMode: v.onboarding,
    supportInboxEmail: inbox || null,
    supportWebhookUrl: v.webhookUrl || null,
  };
  await prisma.appSetting.upsert({
    where: appSettingWhere(null) as never,
    update: data,
    create: { id: "singleton", ...data },
  });

  let forwarded = 0;
  if (inbox) {
    if (v.support === "EMAIL" && before.support !== "EMAIL") forwarded += await forwardOpenThreads("SUPPORT", inbox);
    if (v.onboarding === "EMAIL" && before.onboarding !== "EMAIL") {
      forwarded += await forwardOpenThreads("ONBOARDING", inbox);
    }
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/support");
  revalidatePath("/admin/onboarding");
  return { ok: true, data: { forwarded } };
}

/**
 * Fire a sample payload at the configured webhook, on demand.
 *
 * 🟡 This exists because of how the failure looks without it. A webhook URL with a typo
 * in it breaks nothing visible: the reply email still goes, the thread still says
 * answered, and the only symptom is a WhatsApp the customer never received. Nobody
 * finds that out until somebody complains, and by then it has happened to everyone.
 *
 * The payload is the real shape with `test: true` on it, so a CRM can route it to a log
 * instead of messaging whoever the sample names.
 */
export async function testSupportWebhook(url: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;

  const target = url.trim();
  if (!target) return { ok: false, error: "Paste the webhook URL first." };
  let parsed: URL | null = null;
  try {
    parsed = new URL(target);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "https:") return { ok: false, error: "The webhook must be a full https URL." };

  const sample: SupportRequestFacts = {
    id: "test",
    number: 1001,
    kind: "SUPPORT",
    topic: SUPPORT_TOPICS.SUPPORT[0]!,
    subject: "Test from Assess360 settings",
    contactEmail: "test@example.com",
    contactWhatsapp: "+919999999999",
    contactName: "Test Customer",
    tenantId: "test",
    tenantName: "Test Workspace",
  };
  const err = await postSupportWebhook(
    target,
    replyPayload(sample, "This is a test. No customer was notified.", threadUrl("SUPPORT", "test"), true),
  );
  if (err) return { ok: false, error: err };
  return { ok: true };
}

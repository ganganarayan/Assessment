"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, sendWaba } from "@/lib/nurture/send";
import { PLATFORM_SUPPORT_EMAIL } from "@/lib/platform-support";
import { resolveDfyWabaTemplate } from "@/lib/settings/config";
import { toE164Digits } from "@/features/nurture/config";
import { MARKETING } from "@/lib/marketing/content";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { dfySchema, type DfyInput } from "@/features/marketing/dfy-schema";

/**
 * The done-for-you intake.
 *
 * Order of operations is the whole design: STORE, then notify. The owner's alert goes
 * out on the platform's own mail path, which is best-effort by nature - and an applicant
 * who filled in ten fields because the home page promised a finished funnel in 24 hours
 * must not evaporate because a mail host timed out. A failed notification leaves
 * notifiedAt null, which is a findable row rather than a silent loss.
 *
 * Everything is captured as free text rather than enums. The fields are the brief's, and
 * what a person types into "who is a bad lead for you" is the raw material the gate gets
 * written from; normalising it into options now would throw away the only part of this
 * form that cannot be guessed.
 */



const line = (label: string, value: string) => `${label}: ${value || "-"}`;

export async function submitDfyRequest(input: DfyInput): Promise<ActionResult> {
  const parsed = dfySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const v = parsed.data;

  // One applicant should not be able to fill the pipeline. Keyed on the forwarded IP
  // where there is one; a shared key is still a cap, just a blunter one.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`dfy:${ip}`, 5, 60 * 60 * 1000)) {
    return { ok: false, error: "That is a few applications in a row. Email us instead and we will pick it up." };
  }

  // STORE FIRST. Everything after this point can fail without costing the application.
  const row = await prisma.dfyRequest.create({
    data: {
      business: v.business,
      email: v.email,
      whatsapp: v.whatsapp,
      website: v.website || null,
      sells: v.sells,
      pricePoint: v.pricePoint,
      trafficSource: v.trafficSource,
      monthlyLeads: v.monthlyLeads,
      badLead: v.badLead,
      calendarLink: v.calendarLink || null,
      adAccountAccess: v.adAccountAccess,
    },
    select: { id: true },
  });

  const body = [
    line("Business", v.business),
    line("Website", v.website ?? ""),
    line("Email", v.email),
    line("WhatsApp", v.whatsapp),
    line("Sells", v.sells),
    line("Price point", v.pricePoint),
    line("Traffic", v.trafficSource),
    line("Leads / month", v.monthlyLeads),
    line("Ad account access", v.adAccountAccess ? "Yes" : "No"),
    line("Calendar", v.calendarLink ?? ""),
    "",
    "Who is a BAD lead for them:",
    v.badLead,
  ].join("\n");

  // Best effort, both of them. The platform's own mail path (tenantId null), never the
  // applicant's - they do not have one.
  const err = await sendEmail(
    null,
    PLATFORM_SUPPORT_EMAIL,
    `DFY build request: ${v.business}`,
    `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
  ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

  if (!err) {
    await prisma.dfyRequest.update({ where: { id: row.id }, data: { notifiedAt: new Date() } }).catch(() => {});
  } else {
    console.error("[dfy] owner alert failed:", err);
  }

  // The applicant's confirmation. A failure here is logged and swallowed for the same
  // reason: they are already looking at the confirmation on screen, which is the part
  // that cannot fail.
  await sendEmail(
    null,
    v.email,
    `We have your details - your scorecard is being built`,
    confirmationHtml(v.business),
  ).catch(() => "failed");

  // And on WhatsApp, IF an approved template has been configured. Silent otherwise:
  // a Meta template must be approved in Business Manager before it can be sent, so
  // firing blindly would reject on every submission and there would be nothing anyone
  // could do about it from inside this app.
  const waTemplate = await resolveDfyWabaTemplate().catch(() => null);
  if (waTemplate) {
    const digits = toE164Digits(v.whatsapp, "91");
    if (digits) {
      const waErr = await sendWaba(null, digits, waTemplate.template, waTemplate.lang, [v.business]).catch(
        (e: unknown) => (e instanceof Error ? e.message : String(e)),
      );
      if (waErr) console.error("[dfy] WhatsApp confirmation failed:", waErr);
    }
  }

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function confirmationHtml(business: string): string {
  return `
<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">
  <p>Thanks - we have the details for <strong>${escapeHtml(business)}</strong>.</p>
  <p><strong>The 24-hour clock starts now.</strong> You will get a live scorecard link, the gate
  questions we wrote, the scoring weights and the result bands.</p>
  <p>Two things that speed it up, if you have them:</p>
  <ul>
    <li>Your Meta pixel ID, if you are running ads already.</li>
    <li>Anything written down about who you do <em>not</em> want - a disqualification list, a
    note from a sales call, an old intake form.</li>
  </ul>
  <p>Reply to this email with either and we will fold them in.</p>
  <p style="color:#666">${MARKETING.name}</p>
</div>`;
}

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { isFeatureReleased } from "@/lib/features/release";
import { sendEmail, sendWaba } from "@/lib/nurture/send";
import { toE164Digits } from "@/features/nurture/config";
import { lifecycleStage } from "@/lib/lifecycle/stages";

/**
 * THE SENDER - drains plans that have come due, and nothing else.
 *
 * Deliberately stupid. Every judgement was made by the planner hours ago; this walks
 * a queue, checks four things that must be true at the moment of sending rather than
 * at the moment of deciding, and hands the message to the existing nurture sender.
 *
 * 🔴 THE FOUR CHECKS ARE AT SEND TIME ON PURPOSE. A plan written at 06:00 goes out at
 * 21:40, and in those fifteen hours the person can unsubscribe, subscribe, have their
 * trial end, or the owner can pull the switch. Checking any of this when the plan was
 * written would send a "your trial is running out" email to somebody who paid at lunch.
 *
 *   1. the release switch, read fresh
 *   2. the live switch, which is what makes dry run dry
 *   3. the row's own dry-run stamp
 *   4. the profile is still ACTIVE, which is also how an opt-out bites: unsubscribing
 *      moves the profile to UNSUBSCRIBED, so one status check covers both
 *
 * 🟢 EMAIL IS THE FLOOR, NOT A FALLBACK. Email always goes; WhatsApp is additive on
 * the stages that allow it. There is no "if WhatsApp fails, send email" branch,
 * because that branch is where double sends come from. If WhatsApp fails, the email
 * has already gone and the row says what happened.
 */

const BATCH = 50;

export interface SendOutcome {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  waSent: number;
  waFailed: number;
  dryRun: boolean;
  heldBack: boolean;
}

/** Is the sender allowed to send anything at all right now? */
async function liveNow(): Promise<boolean> {
  try {
    const s = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { lifecycleLive: true },
    });
    return s?.lifecycleLive === true;
  } catch (e) {
    // 🔴 Fails CLOSED, unlike the contact suppression check, and the asymmetry is the
    // point. A failed read there would stop transactional mail somebody asked for; a
    // failed read here only delays an unsolicited one by one heartbeat.
    console.error("[lifecycle] live switch read failed:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** The link that has to be on every one of these, by decency and by law. */
function unsubscribeUrl(token: string): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/ls/${token}`;
}

/**
 * The body as it actually goes out: what the model wrote, plus the way out.
 *
 * Appended here rather than asked of the model, because a footer the model can forget
 * is a footer that will be forgotten on exactly the message somebody wanted to escape.
 */
function withFooter(body: string, token: string): string {
  const url = unsubscribeUrl(token);
  return `${body}\n<hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5" />\n<p style="font-size:12px;color:#666">You are getting this because you started an Assess360 trial. <a href="${url}">Stop these emails</a>.</p>`;
}

export async function sendDueLifecycle(now: Date = new Date()): Promise<SendOutcome> {
  const out: SendOutcome = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    waSent: 0,
    waFailed: 0,
    dryRun: false,
    heldBack: false,
  };

  // The platform scope is exempt from every release switch, so this asks whether the
  // feature is RELEASED rather than whether we are allowed to use it. See plan.ts.
  if (!(await isFeatureReleased("lifecycle"))) {
    out.heldBack = true;
    return out;
  }
  if (!(await liveNow())) {
    out.dryRun = true;
    return out;
  }

  const due = await prisma.lifecyclePlan.findMany({
    where: { status: { in: ["DRAFT", "APPROVED"] }, verdict: "SEND", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: BATCH,
    select: { id: true },
  });

  for (const { id } of due) {
    // Claim before doing anything. A heartbeat tick, another replica and a hand-run
    // drain can all overlap, and the claim is the only thing standing between that
    // and a person hearing the same thing twice.
    const claim = await prisma.lifecyclePlan.updateMany({
      where: { id, status: { in: ["DRAFT", "APPROVED"] } },
      data: { status: "SENT", sentAt: now },
    });
    if (claim.count === 0) continue;
    out.claimed++;

    try {
      const result = await deliverOne(id);
      if (result === "skipped") out.skipped++;
      else {
        out.sent++;
        if (result.waSent) out.waSent++;
        if (result.waFailed) out.waFailed++;
      }
    } catch (e) {
      out.failed++;
      const message = e instanceof Error ? e.message : String(e);
      // 🟡 FAILED is terminal here, with no retry, and that is deliberate. A nurture
      // message is tied to a day and a state; retrying tomorrow sends a message about
      // a situation that has moved on. Tomorrow's planner writes a fresh one from
      // fresh facts, which is the better version of a retry.
      await prisma.lifecyclePlan
        .update({ where: { id }, data: { status: "FAILED", error: message.slice(0, 500) } })
        .catch(() => {});
    }
  }

  return out;
}

type Delivered = "skipped" | { waSent: boolean; waFailed: boolean };

/** Send one plan. The row is already claimed, so this either delivers or records why not. */
async function deliverOne(planId: string): Promise<Delivered> {
  const plan = await prisma.lifecyclePlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      tenantId: true,
      stageKey: true,
      emailSubject: true,
      emailBody: true,
      waTemplate: true,
      waVars: true,
      dryRun: true,
      profile: { select: { id: true, status: true, optOutToken: true } },
    },
  });
  if (!plan) return "skipped";

  const stop = async (why: string): Promise<"skipped"> => {
    await prisma.lifecyclePlan.update({
      where: { id: planId },
      data: { status: "SKIPPED", verdict: "SKIP", sentAt: null, reason: why.slice(0, 300) },
    });
    return "skipped";
  };

  // 🔴 The row's own dry-run stamp still counts even with the global switch on. A plan
  // written during the dry-run week must never go out when the switch is flipped: the
  // owner turned sending on for TODAY, not retrospectively for everything queued.
  if (plan.dryRun) return stop("Written during dry run, so never sent.");
  if (plan.profile.status !== "ACTIVE") return stop(`Left the sequence (${plan.profile.status}).`);
  if (!plan.emailSubject || !plan.emailBody) return stop("No email was written for this one.");

  const owner = await prisma.user.findFirst({
    where: { tenantId: plan.tenantId, deletedAt: null, staffPermission: null },
    orderBy: { createdAt: "asc" },
    select: { email: true, whatsapp: true },
  });
  if (!owner?.email) return stop("No owner login to send to.");

  // The email. Sent from the PLATFORM's own sender (tenantId null): this is the
  // product writing to its customer, not a tenant writing to a respondent.
  const emailError = await sendEmail(
    null,
    owner.email,
    plan.emailSubject,
    withFooter(plan.emailBody, plan.profile.optOutToken),
  );
  await prisma.nurtureLog
    .create({
      data: {
        tenantId: null,
        submissionId: null,
        channel: "EMAIL",
        status: emailError ? "FAILED" : "SENT",
        toAddress: owner.email,
        error: emailError?.slice(0, 500) ?? null,
      },
    })
    .catch(() => {});

  // WhatsApp, only where the stage allows it and only with the slots it declared.
  let waSent = false;
  let waFailed = false;
  const stage = lifecycleStage(plan.stageKey);
  const vars = Array.isArray(plan.waVars)
    ? plan.waVars.filter((v): v is string => typeof v === "string")
    : [];
  const template = plan.waTemplate;

  if (template && stage?.channels.waTemplate === template && vars.length === stage.channels.waSlots) {
    const digits = toE164Digits(owner.whatsapp, "91");
    if (digits) {
      const waError = await sendWaba(null, digits, template, "en", vars);
      waSent = !waError;
      waFailed = !!waError;
      await prisma.nurtureLog
        .create({
          data: {
            tenantId: null,
            submissionId: null,
            channel: "WABA",
            status: waError ? "FAILED" : "SENT",
            toAddress: digits,
            error: waError?.slice(0, 500) ?? null,
          },
        })
        .catch(() => {});
    }
  }

  if (emailError) {
    await prisma.lifecyclePlan.update({
      where: { id: planId },
      data: { status: "FAILED", error: emailError.slice(0, 500) },
    });
    throw new Error(emailError);
  }

  return { waSent, waFailed };
}

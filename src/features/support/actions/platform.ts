"use server";

import { revalidatePath } from "next/cache";
import { type SupportStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { resolveSupportRouting } from "@/lib/support/config";
import { forwardToInbox, notifyTenantOfReply, requestFacts } from "@/lib/support/notify";
import { messageSchema } from "@/features/support/schema";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The owner's side of a support thread.
 *
 * 🔴 A REPLY CANNOT BE RECALLED. Saving it sends an email, and WhatsApp with it in
 * IN_APP mode. That is why the private note has its OWN action and its own button
 * rather than a tick on the reply box: a note typed with the tick in the wrong state is
 * a mistake there is no undo for, and no amount of confirming makes a shared box safe.
 */

function pathsFor(kind: "SUPPORT" | "ONBOARDING", id: string): string[] {
  const section = kind === "ONBOARDING" ? "onboarding" : "support";
  return [`/admin/${section}`, `/admin/${section}/${id}`, `/w/${section}`, `/w/${section}/${id}`];
}

function revalidateThread(kind: "SUPPORT" | "ONBOARDING", id: string): void {
  for (const p of pathsFor(kind, id)) revalidatePath(p);
}

/**
 * Answer the tenant.
 *
 * firstResponseAt is stamped only when it is null. It is the one support metric worth
 * keeping and it cannot be recovered from message rows once a thread has several
 * replies, so it is written at the moment it is true.
 */
export async function replyToRequest(input: { requestId: string; body: string }): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const denied = editDenied(user);
  if (denied) return denied;

  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Write something first." };

  const req = await prisma.supportRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true, kind: true, firstResponseAt: true, status: true },
  });
  if (!req) return { ok: false, error: "That request no longer exists." };
  if (req.status === "FORWARDED") {
    return {
      ok: false,
      error: "This thread was handed to the support inbox. Reply from there, or move it back in-app first.",
    };
  }

  const message = await prisma.supportMessage.create({
    data: {
      requestId: req.id,
      authorRole: "PLATFORM",
      authorName: user.name,
      authorId: user.id,
      body: parsed.data.body,
    },
    select: { id: true },
  });

  await prisma.supportRequest.update({
    where: { id: req.id },
    data: {
      status: "AWAITING_TENANT",
      ...(req.firstResponseAt ? {} : { firstResponseAt: new Date() }),
    },
  });

  const facts = await requestFacts(req.id);
  if (facts) {
    const outcome = await notifyTenantOfReply(facts, parsed.data.body);
    await prisma.supportMessage
      .update({
        where: { id: message.id },
        data: {
          emailStatus: outcome.emailStatus,
          emailError: outcome.emailError,
          webhookStatus: outcome.webhookStatus,
          webhookError: outcome.webhookError,
        },
      })
      .catch(() => {});
  }

  revalidateThread(req.kind, req.id);
  return { ok: true };
}

/** The owner's private note. Never sent, never shown to the tenant. */
export async function addInternalNote(input: { requestId: string; body: string }): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const denied = editDenied(user);
  if (denied) return denied;

  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Write something first." };

  const req = await prisma.supportRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true, kind: true },
  });
  if (!req) return { ok: false, error: "That request no longer exists." };

  await prisma.supportMessage.create({
    data: {
      requestId: req.id,
      authorRole: "PLATFORM",
      authorName: user.name,
      authorId: user.id,
      body: parsed.data.body,
      isInternal: true,
    },
  });
  // Deliberately does NOT move the status. A note is thinking, not an answer, and a
  // thread that stops badging because somebody wrote themselves a reminder is a thread
  // that gets forgotten.
  revalidateThread(req.kind, req.id);
  return { ok: true };
}

const SETTABLE: readonly SupportStatus[] = ["OPEN", "AWAITING_US", "AWAITING_TENANT", "RESOLVED", "CLOSED"];

/** Move a thread along. FORWARDED is not in the list: it is set by forwarding, which is
 *  an action with a send behind it, not a label. */
export async function setRequestStatus(requestId: string, status: SupportStatus): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;
  if (!SETTABLE.includes(status)) return { ok: false, error: "Unknown status." };

  const req = await prisma.supportRequest.findUnique({ where: { id: requestId }, select: { kind: true } });
  if (!req) return { ok: false, error: "That request no longer exists." };

  await prisma.supportRequest.update({ where: { id: requestId }, data: { status } });
  revalidateThread(req.kind, requestId);
  return { ok: true };
}

/**
 * Send a failed notification again.
 *
 * The thread shows a yellow marker beside a send that did not go, and this is the
 * button on it. Re-sends the message that failed rather than composing anything new, so
 * the customer never receives two different versions of the same reply.
 */
export async function resendNotification(messageId: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;

  const m = await prisma.supportMessage.findUnique({
    where: { id: messageId },
    select: { id: true, body: true, isInternal: true, authorRole: true, requestId: true, request: { select: { kind: true } } },
  });
  if (!m) return { ok: false, error: "That message no longer exists." };
  if (m.isInternal || m.authorRole !== "PLATFORM") {
    return { ok: false, error: "Only a reply to the tenant is sent, so only a reply can be resent." };
  }

  const facts = await requestFacts(m.requestId);
  if (!facts) return { ok: false, error: "That request no longer exists." };

  const outcome = await notifyTenantOfReply(facts, m.body);
  await prisma.supportMessage.update({
    where: { id: m.id },
    data: {
      emailStatus: outcome.emailStatus,
      emailError: outcome.emailError,
      webhookStatus: outcome.webhookStatus,
      webhookError: outcome.webhookError,
    },
  });

  revalidateThread(m.request.kind, m.requestId);
  if (outcome.emailStatus === "FAILED") return { ok: false, error: outcome.emailError ?? "The email failed again." };
  return { ok: true };
}

/**
 * Hand one thread to the support inbox by hand, without changing the mode.
 *
 * Used for the one ticket that belongs to somebody else while the queue stays in-app.
 * forwardedAt is only stamped when the send worked, so a forward that failed is a thread
 * still visibly owned by the owner rather than one silently handed to nobody.
 */
export async function forwardRequest(requestId: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;

  const routing = await resolveSupportRouting();
  if (!routing.inboxEmail) {
    return { ok: false, error: "Set the support inbox address in Settings first, or this forwards nowhere." };
  }

  const req = await prisma.supportRequest.findUnique({
    where: { id: requestId },
    select: {
      kind: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { authorRole: true, authorName: true, body: true, createdAt: true, isInternal: true },
      },
    },
  });
  if (!req) return { ok: false, error: "That request no longer exists." };

  const facts = await requestFacts(requestId);
  if (!facts) return { ok: false, error: "That request no longer exists." };

  const sent = await forwardToInbox(facts, req.messages, routing.inboxEmail);
  if (sent !== "SENT") return { ok: false, error: "The forward did not send. The thread is unchanged." };

  await prisma.supportRequest.update({
    where: { id: requestId },
    data: { status: "FORWARDED", forwardedAt: new Date() },
  });
  revalidateThread(req.kind, requestId);
  return { ok: true };
}

/**
 * Bring a forwarded thread back in-app.
 *
 * It exists because forwarding is one-way for the customer and must not be one-way for
 * the owner: a ticket sent to the inbox by mistake, or one support hands back, has to be
 * answerable here again. forwardedAt is left in place as the record that it went out.
 */
export async function reclaimRequest(requestId: string): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;

  const req = await prisma.supportRequest.findUnique({ where: { id: requestId }, select: { kind: true, status: true } });
  if (!req) return { ok: false, error: "That request no longer exists." };
  if (req.status !== "FORWARDED") return { ok: false, error: "That thread is already in-app." };

  await prisma.supportRequest.update({ where: { id: requestId }, data: { status: "AWAITING_US" } });
  revalidateThread(req.kind, requestId);
  return { ok: true };
}

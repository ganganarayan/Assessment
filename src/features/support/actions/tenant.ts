"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, isStaff } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rate-limit";
import { storage, tenantKey, isStorageConfigured } from "@/lib/storage/r2";
import { resolveSupportRouting } from "@/lib/support/config";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  supportRef,
} from "@/lib/support/model";
import { alertPlatform, forwardToInbox, requestFacts, sendRaiseAutoReply } from "@/lib/support/notify";
import { raiseSchema, messageSchema, whatsappSchema } from "@/features/support/schema";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The tenant's side: raise one, reply on one, mark one read, and save the number a
 * reply is sent to.
 *
 * 🔴 OWNER ONLY, by decision. Read-only staff enforcement is still not wired across the
 * app, and a support thread carries the owner's replies about the workspace's billing
 * and configuration. One guard here is a smaller thing to get right than a new surface
 * to re-audit when that gap is closed.
 *
 * STORE, THEN NOTIFY, like every other intake in this app. A customer whose funnel has
 * stopped collecting leads must not lose their report because a mail host timed out, and
 * what the send actually did is stamped on the message so a failure is visible in the
 * thread instead of only in the logs.
 */

/**
 * The acting workspace, refused for staff.
 *
 * 🔴 An IMPERSONATING super admin is refused for the write paths too, and that is not
 * a permission so much as a data rule. An operator who has entered a workspace is not
 * the customer: a request raised there would snapshot the operator's own email as the
 * person to answer, and a reply typed there would appear in the record under the
 * customer's workspace as though they had written it. Reading is fine, which is why
 * the screens stay visible and only the writes stop.
 */
async function requireWorkspaceOwner() {
  const ctx = await requireWorkspace();
  if (isStaff(ctx.user)) return null;
  return ctx;
}

const DENIED = "Support threads are open to the workspace owner only.";
const OPERATING =
  "You are operating this workspace. Raise and answer support from the platform console instead.";

interface UploadedFile {
  key: string;
  filename: string;
  contentType: string;
  bytes: number;
}

/**
 * Put the screenshots in R2, under this tenant's own prefix.
 *
 * 🟡 DEGRADES, never blocks. Storage is optional in this app and may simply not be
 * configured; a request that cannot carry its screenshot is still a request worth
 * having, and the thread says which files did not make it.
 */
async function storeAttachments(tenantId: string, requestId: string, files: File[]): Promise<{
  stored: UploadedFile[];
  skipped: string[];
}> {
  const stored: UploadedFile[] = [];
  const skipped: string[] = [];
  if (files.length === 0) return { stored, skipped };

  if (!(await isStorageConfigured())) {
    return { stored, skipped: files.map((f) => f.name) };
  }

  let budget = MAX_ATTACHMENT_TOTAL_BYTES;
  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    const type = file.type || "application/octet-stream";
    if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(type) || file.size > MAX_ATTACHMENT_BYTES) {
      skipped.push(file.name);
      continue;
    }
    // The total, not just each one. The client checks it too; this is the guard that
    // actually holds, since the client is not where limits are enforced.
    if (file.size > budget) {
      skipped.push(file.name);
      continue;
    }
    budget -= file.size;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      // The stored name is generated. A filename a person typed is not a key: two
      // people attach "screenshot.png" and one overwrites the other.
      const ext = type === "application/pdf" ? "pdf" : type.replace("image/", "");
      const key = tenantKey(tenantId, `support/${requestId}/${randomUUID()}.${ext}`);
      await storage.upload({ key, body: bytes, contentType: type });
      stored.push({ key, filename: file.name.slice(0, 180), contentType: type, bytes: file.size });
    } catch (e) {
      console.error("[support] attachment upload failed:", e instanceof Error ? e.message : String(e));
      skipped.push(file.name);
    }
  }
  return { stored, skipped };
}

function filesFrom(form: FormData): File[] {
  return form
    .getAll("files")
    .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v && (v as File).size > 0);
}

/**
 * Raise a ticket or an onboarding request.
 *
 * FormData rather than a typed object because the screenshots travel with it. The body
 * size limit is already 8mb for the builder's own saves, so three screenshots need no
 * configuration change.
 */
export async function raiseSupportRequest(
  form: FormData,
): Promise<ActionResult<{ ref: string; id: string; skippedFiles: string[] }>> {
  const ctx = await requireWorkspaceOwner();
  if (!ctx) return { ok: false, error: DENIED };
  if (ctx.impersonating) return { ok: false, error: OPERATING };
  const { user, tenantId } = ctx;

  const parsed = raiseSchema.safeParse({
    kind: String(form.get("kind") ?? ""),
    topic: String(form.get("topic") ?? ""),
    subject: String(form.get("subject") ?? ""),
    body: String(form.get("body") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const v = parsed.data;

  const routing = await resolveSupportRouting();
  const mode = v.kind === "ONBOARDING" ? routing.onboarding : routing.support;
  if (mode === "OFF") {
    // The form is withdrawn in OFF mode, so reaching here means a stale page. The
    // message names the way through rather than saying no.
    return { ok: false, error: "New requests are closed right now. Email or WhatsApp support instead." };
  }

  // One workspace should not be able to fill the queue. Per tenant rather than per IP:
  // this is a signed-in surface, so the tenant is the identity that matters.
  if (!rateLimit(`support:${tenantId}`, 10, 60 * 60 * 1000)) {
    return { ok: false, error: "That is several requests in a row. Reply on an open thread, or email support." };
  }

  // Snapshotted, not read live at reply time: a reply answers the person who asked, on
  // the address the conversation started on.
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, whatsapp: true } });

  const created = await prisma.supportRequest.create({
    data: {
      kind: v.kind,
      topic: v.topic,
      subject: v.subject,
      tenantId,
      createdByUserId: user.id,
      contactEmail: me?.email ?? user.email,
      contactWhatsapp: me?.whatsapp ?? null,
      messages: {
        create: {
          authorRole: "TENANT",
          authorName: user.name,
          authorId: user.id,
          body: v.body,
        },
      },
    },
    select: { id: true, number: true, messages: { select: { id: true } } },
  });

  const ref = supportRef(v.kind, created.number);

  const { stored, skipped } = await storeAttachments(tenantId, created.id, filesFrom(form));
  if (stored.length > 0) {
    await prisma.supportAttachment.createMany({
      data: stored.map((f) => ({
        requestId: created.id,
        messageId: created.messages[0]?.id ?? null,
        key: f.key,
        filename: f.filename,
        contentType: f.contentType,
        bytes: f.bytes,
      })),
    });
  }

  // Everything below here can fail without costing the request.
  const facts = await requestFacts(created.id);
  if (facts) {
    await sendRaiseAutoReply(facts, v.body);
    if (mode === "EMAIL") {
      // The conversation moves now rather than when somebody notices it. FORWARDED is
      // what makes the tenant's thread stop claiming to be a live conversation.
      const inbox = routing.inboxEmail;
      if (inbox) {
        const sent = await forwardToInbox(
          facts,
          [{ authorRole: "TENANT", authorName: user.name, body: v.body, createdAt: new Date(), isInternal: false }],
          inbox,
        );
        if (sent === "SENT") {
          await prisma.supportRequest
            .update({ where: { id: created.id }, data: { status: "FORWARDED", forwardedAt: new Date() } })
            .catch(() => {});
        } else {
          // 🔴 FORWARDED is what tells the customer "the answer is in your inbox". Set
          // on a forward that did not send, it is a lie the customer reads while nobody
          // has the request at all. Left OPEN, it is still in the owner's queue screen,
          // and the mode switch will try it again because forwardedAt is still null.
          console.error("[support] forward on raise failed; thread left in-app.");
          await alertPlatform(facts, v.body, false);
        }
      } else {
        // EMAIL mode cannot be saved without an inbox, so this is a state the setter
        // prevents. If it happens anyway, the thread stays in-app rather than vanishing.
        console.error("[support] EMAIL mode with no inbox address; kept in-app.");
      }
    } else {
      await alertPlatform(facts, v.body, false);
    }
  }

  revalidatePath(`/w/${v.kind === "ONBOARDING" ? "onboarding" : "support"}`);
  // The skipped names are RETURNED rather than swallowed. A screenshot that silently
  // did not attach is the kind of thing somebody discovers three replies later, when
  // the answer has already been written around its absence.
  return { ok: true, data: { ref, id: created.id, skippedFiles: skipped } };
}

/** The tenant adds something to an open thread. */
export async function replyAsTenant(input: { requestId: string; body: string }): Promise<ActionResult> {
  const ctx = await requireWorkspaceOwner();
  if (!ctx) return { ok: false, error: DENIED };
  if (ctx.impersonating) return { ok: false, error: OPERATING };
  const { user, tenantId } = ctx;

  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Write something first." };

  const req = await prisma.supportRequest.findFirst({
    where: { id: parsed.data.requestId, tenantId },
    select: { id: true, kind: true, status: true },
  });
  if (!req) return { ok: false, error: "That request no longer exists." };
  if (req.status === "FORWARDED") {
    return { ok: false, error: "This one moved to email. Reply to the email from support and they will pick it up." };
  }

  await prisma.supportMessage.create({
    data: {
      requestId: req.id,
      authorRole: "TENANT",
      authorName: user.name,
      authorId: user.id,
      body: parsed.data.body,
    },
  });
  // AWAITING_US is what lights the owner's badge. A closed thread that the customer
  // comes back to is open again: the alternative is a reply nobody is told about.
  await prisma.supportRequest.update({ where: { id: req.id }, data: { status: "AWAITING_US" } });

  const facts = await requestFacts(req.id);
  if (facts) await alertPlatform(facts, parsed.data.body, true);

  revalidatePath(`/w/${req.kind === "ONBOARDING" ? "onboarding" : "support"}/${req.id}`);
  return { ok: true };
}

/**
 * The tenant opened the thread, so their own badge goes out.
 *
 * Called from the thread page on render. Scoped by tenant, so it can only ever stamp a
 * row the caller can already read.
 */
export async function markThreadSeen(requestId: string): Promise<void> {
  const ctx = await requireWorkspaceOwner();
  if (!ctx) return;
  // 🔴 Never while operating the workspace. The owner opening a customer's thread from
  // inside it would put out the customer's own "you have a reply" badge before they had
  // ever seen it, and nothing would ever light it again.
  if (ctx.impersonating) return;
  await prisma.supportRequest
    .updateMany({ where: { id: requestId, tenantId: ctx.tenantId }, data: { lastSeenByTenantAt: new Date() } })
    .catch(() => {});
}

/**
 * Save the WhatsApp number a reply is sent to.
 *
 * On the LOGIN and not the workspace: the person who raised the ticket is the person who
 * wants telling it was answered. Blank is allowed and means email only, which the thread
 * says out loud rather than silently dropping the WhatsApp.
 */
export async function saveMyWhatsapp(whatsapp: string): Promise<ActionResult> {
  const ctx = await requireWorkspaceOwner();
  if (!ctx) return { ok: false, error: DENIED };
  // It writes the SIGNED-IN login's row, which while impersonating is the operator's
  // own. Saving the owner's number as the customer's support contact is not a thing
  // anybody wants, so the card is hidden there and the action refuses as well.
  if (ctx.impersonating) return { ok: false, error: OPERATING };
  const parsed = whatsappSchema.safeParse({ whatsapp });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the number." };

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { whatsapp: parsed.data.whatsapp || null },
  });
  revalidatePath("/w/settings");
  return { ok: true };
}

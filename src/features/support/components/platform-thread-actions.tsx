"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type SupportStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addInternalNote,
  forwardRequest,
  reclaimRequest,
  replyToRequest,
  setRequestStatus,
} from "@/features/support/actions/platform";

/**
 * Answer, note, close, hand over.
 *
 * 🔴 TWO BOXES, NOT ONE BOX WITH A TICK. A reply fires an email the instant it is saved
 * and there is no unsend; a private note is for the owner's own eyes. Sharing one
 * textarea between them means one wrong tick sends an internal note to the customer, and
 * no confirmation dialog makes that safe. So they are separate boxes with separate
 * buttons, and only one of them says Send.
 *
 * The reply NAMES its recipient and its channels before it goes. "Reply" on its own
 * leaves the owner to remember whether WhatsApp is wired up on this account.
 */
export function PlatformThreadActions({
  requestId,
  status,
  contactEmail,
  contactWhatsapp,
  webhookReady,
  inAppMode,
  inboxEmail,
}: {
  requestId: string;
  status: SupportStatus;
  contactEmail: string;
  contactWhatsapp: string | null;
  /** A CRM webhook is configured, so the reply can be announced to it. */
  webhookReady: boolean;
  /** This queue is IN_APP. The webhook is suppressed in every other mode. */
  inAppMode: boolean;
  inboxEmail: string | null;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // What the owner is about to cause, named plainly. This app sends the email and
  // posts to the CRM; what the CRM then sends is its own business, so the wording says
  // "your CRM" rather than claiming a WhatsApp went out from here.
  const webhookWillFire = inAppMode && webhookReady;
  const channels = webhookWillFire
    ? `an email to ${contactEmail}, and a post to your CRM${contactWhatsapp ? ` carrying ${contactWhatsapp}` : " with no phone number on it"}`
    : `an email to ${contactEmail}`;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        done();
        router.refresh();
      }
      setMsg(r.ok ? "Done." : r.error ?? "That did not work.");
    });
  }

  const forwarded = status === "FORWARDED";

  return (
    <div className="flex flex-col gap-6">
      {forwarded ? (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3">
          <p className="text-sm">
            🟡 This thread was handed to the support inbox. The customer has been told to watch their
            email, so answering here would put a reply somewhere they are not looking.
          </p>
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => reclaimRequest(requestId), () => undefined)}
            >
              Bring it back in-app
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="support-reply">Reply to the customer</Label>
          <Textarea
            id="support-reply"
            rows={6}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="What you did, or what you need from them. This is sent the moment you press the button."
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Sending fires {channels}.
            {inAppMode && !webhookReady
              ? " No CRM webhook is configured, so email only. Set one in Settings and your CRM can WhatsApp them."
              : ""}
            {inAppMode && webhookReady && !contactWhatsapp
              ? " They have saved no WhatsApp number, so your CRM gets the reply with contact_phone null."
              : ""}
            {!inAppMode ? " This queue is not set to in-app, so the CRM post stays off." : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={pending || !reply.trim()}
              onClick={() => {
                // Named, not generic. "Are you sure?" tells the owner nothing they did
                // not already know; the address and the number do.
                if (!window.confirm(`Send this reply? It goes out as ${channels}.`)) return;
                run(() => replyToRequest({ requestId, body: reply }), () => setReply(""));
              }}
            >
              {pending ? "Sending..." : "Send reply"}
            </Button>
            {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <Label htmlFor="support-note">Private note</Label>
        <Textarea
          id="support-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For you. Never sent, never shown to the customer."
        />
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !note.trim()}
            onClick={() => run(() => addInternalNote({ requestId, body: note }), () => setNote(""))}
          >
            Save note
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">Status</span>
        {(["OPEN", "AWAITING_TENANT", "RESOLVED", "CLOSED"] as SupportStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            disabled={pending || status === s}
            onClick={() => run(() => setRequestStatus(requestId, s), () => undefined)}
          >
            {s === "AWAITING_TENANT" ? "Waiting on them" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
        {!forwarded ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || !inboxEmail}
            title={inboxEmail ? `Forward to ${inboxEmail}` : "Set the support inbox address in Settings first"}
            onClick={() => {
              if (!inboxEmail) return;
              if (!window.confirm(`Hand this to ${inboxEmail}? The customer is told to watch their email instead.`)) {
                return;
              }
              run(() => forwardRequest(requestId), () => undefined);
            }}
          >
            Hand to support inbox
          </Button>
        ) : null}
      </div>
    </div>
  );
}

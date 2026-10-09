import { Badge } from "@/components/ui/badge";
import { formatIST } from "@/lib/date";
import { type ThreadAttachment, type ThreadMessage } from "@/features/support/data";
import { ResendButton } from "@/features/support/components/resend-button";

/**
 * The conversation itself.
 *
 * The tenant's payload never CONTAINS an internal note (the query drops it), so the
 * isInternal branch below is for the owner's own screen rather than a guard. A note kept
 * out of a component but left in the props is a note in the page source.
 */
export function ThreadMessages({
  messages,
  requestAttachments,
  side,
}: {
  messages: ThreadMessage[];
  requestAttachments: ThreadAttachment[];
  side: "tenant" | "platform";
}) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => {
        const mine = side === "tenant" ? m.authorRole === "TENANT" : m.authorRole === "PLATFORM";
        return (
          <div
            key={m.id}
            className={[
              "flex flex-col gap-2 rounded-lg border p-3",
              m.isInternal ? "border-amber-500/60 bg-amber-500/5" : mine ? "bg-[var(--muted)]" : "",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <span className="font-medium text-[var(--foreground)]">
                {m.authorRole === "PLATFORM" ? (side === "platform" ? m.authorName : "Assess360 support") : m.authorName}
              </span>
              <span>{formatIST(new Date(m.createdAt))}</span>
              {m.isInternal ? <Badge variant="outline">Private note, never sent</Badge> : null}
            </div>

            <div className="whitespace-pre-wrap text-sm">{m.body}</div>

            {m.attachments.length > 0 ? <Attachments items={m.attachments} /> : null}

            {/* What the notification actually did. Shown on the owner's side only: a
                customer does not need to read that their own email bounced from us, and
                the owner is the only person who can do anything about it. */}
            {side === "platform" && (m.emailStatus || m.webhookStatus) ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <SendMarker channel="Email" status={m.emailStatus} error={m.emailError} />
                {/* The POST to the CRM, which is what produces the WhatsApp at the
                    other end. Named for what this app did, not for what the CRM then
                    does with it: claiming "whatsapp sent" here would be reporting
                    somebody else's delivery. */}
                <SendMarker channel="CRM webhook" status={m.webhookStatus} error={m.webhookError} />
                {m.emailStatus === "FAILED" || m.webhookStatus === "FAILED" ? (
                  <ResendButton messageId={m.id} />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {requestAttachments.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-xs text-[var(--muted-foreground)]">Attached to the request</p>
          <Attachments items={requestAttachments} />
        </div>
      ) : null}
    </div>
  );
}

function Attachments({ items }: { items: ThreadAttachment[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((a) => (
        <li key={a.id}>
          {/* Through the app, never a bucket URL: these carry lead data. */}
          <a
            href={`/api/support/attachments/${a.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs hover:bg-[var(--muted)]"
          >
            {a.filename}
            <span className="text-[var(--muted-foreground)]">{Math.max(1, Math.round(a.bytes / 1024))}kb</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function SendMarker({
  channel,
  status,
  error,
}: {
  channel: string;
  status: string | null;
  error: string | null;
}) {
  if (!status) return null;
  const dot = status === "SENT" ? "🟢" : status === "FAILED" ? "🟡" : "⚪";
  return (
    <span className="text-[var(--muted-foreground)]" title={error ?? undefined}>
      {dot} {channel.toLowerCase()} {status.toLowerCase()}
      {error && status !== "SENT" ? `: ${error.slice(0, 120)}` : ""}
    </span>
  );
}

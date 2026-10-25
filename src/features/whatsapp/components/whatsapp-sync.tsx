"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startWhatsAppSync } from "@/features/whatsapp/actions";
import { type SyncKind, type WabaSyncView } from "@/features/whatsapp/types";

/**
 * Bringing the owner's own contacts and chats off their phone.
 *
 * 🔴 Each button works ONCE, ever, per connection. That is unusual enough that the
 * screen says so before the press rather than after it, and asks for confirmation -
 * the same treatment a delete gets here, for the same reason: there is no second go.
 *
 * What it deliberately does NOT do is hide a button once the window has closed. Meta
 * owns the 24 hours and Meta enforces them; our clock is not good enough to tell
 * somebody their only chance is gone. So the card says what it believes and lets them
 * try, and Meta's refusal is shown verbatim if it comes.
 */

const COPY: Record<SyncKind, { title: string; what: string; warn: string }> = {
  CONTACTS: {
    title: "Bring your contacts across",
    what: "Copies the contacts saved on the phone into Contacts here, so you can message them from this app.",
    warn: "Ask Meta for your WhatsApp contacts now? This can only be done once for this number.",
  },
  HISTORY: {
    title: "Bring your past chats across",
    what: "Copies up to about six months of your one-to-one conversations. Group chats are never included.",
    warn: "Ask Meta for your past chats now? This can only be done once for this number.",
  },
};

export function WhatsAppSync({ sync, canEdit = true }: { sync: WabaSyncView; canEdit?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<SyncKind | null>(null);
  const [pending, start] = useTransition();

  // Nothing to offer for a cloud number: there is no phone holding anything.
  if (!sync.available) return null;

  const ask = (kind: SyncKind) => {
    if (!confirm(COPY[kind].warn)) return;
    setMsg(null);
    setBusy(kind);
    start(async () => {
      const r = await startWhatsAppSync(kind);
      setBusy(null);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setMsg(r.data?.note ?? "Asked Meta.");
      // The stamps the server just wrote are what the buttons read, and a client
      // component will not see them without a fresh render from the server.
      window.location.reload();
    });
  };

  const row = (kind: SyncKind, doneAt: string | null) => (
    <div className="flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium">{COPY[kind].title}</p>
      <p className="text-xs text-[var(--muted-foreground)]">{COPY[kind].what}</p>
      {doneAt ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          🟢 Asked on {doneAt} IST. It arrives in batches, and only what you agreed to share.
        </p>
      ) : (
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => ask(kind)}
            disabled={pending || !canEdit}
          >
            {busy === kind ? "Asking Meta..." : "Ask Meta once"}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Your contacts and chats</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {sync.windowOpen
            ? `🟡 Meta allows each of these once, and only for about 24 hours after connecting${
                sync.timeLeft ? ` (${sync.timeLeft})` : ""
              }. Keep WhatsApp open on the phone while anything is copying over.`
            : "🟡 The 24 hours Meta allows for this have probably passed. You can still try, and Meta will say if it is too late. To get a fresh attempt, disconnect the number and connect it again."}
        </p>
        {sync.closesAt ? (
          <p className="text-xs text-[var(--muted-foreground)]">Window closes {sync.closesAt} IST.</p>
        ) : null}
      </div>

      {row("CONTACTS", sync.contactsAt)}
      {row("HISTORY", sync.historyAt)}

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
      {sync.lastError ? (
        <p className="text-sm text-[var(--muted-foreground)]">🟡 Meta last said: {sync.lastError}</p>
      ) : null}
    </div>
  );
}

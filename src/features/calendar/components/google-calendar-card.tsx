"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { GoogleCalendarRow } from "@/features/calendar/types";
import {
  disconnectGoogleCalendar,
  setGoogleSyncEnabled,
  saveGoogleApp,
} from "@/features/calendar/google";

/**
 * Google Calendar: connect, pause, disconnect, one row per calendar.
 *
 * Connect is a LINK rather than a button with an action behind it, because connecting
 * is a redirect to Google's own consent screen and a server action cannot send a
 * browser anywhere. The outcome comes back as ?google=connected|failed on this page.
 */
export function GoogleCalendarCard({
  calendars,
  appConfigured,
  isPlatform,
  returnTo,
  canEdit,
}: {
  calendars: GoogleCalendarRow[];
  /** False until the platform owner has entered the Google app credentials. */
  appConfigured: boolean;
  /** True in the platform scope, where the credentials themselves are editable. */
  isPlatform: boolean;
  returnTo: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The callback sends the browser back here with the outcome on the URL.
  useEffect(() => {
    const result = params.get("google");
    if (!result) return;
    setMsg(
      result === "connected"
        ? "Google Calendar connected."
        : `Google could not be connected. ${params.get("reason") ?? ""}`.trim(),
    );
  }, [params]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? done : (r.error ?? "That did not work."));
      if (r.ok) {
        setConfirmKey(null);
        router.refresh();
      }
    });

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Google Calendar</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Bookings appear in the connected calendar and move when they move. What is already in
          that calendar blocks a slot, so nobody can book you while you are busy.
        </p>
      </div>

      {msg ? (
        <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-sm text-[var(--muted-foreground)]">{msg}</p>
      ) : null}

      {!appConfigured ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--muted-foreground)]">
          Google is not set up on this platform yet, so there is nothing to connect to.
          {isPlatform ? " Add the app credentials below." : " Ask the platform owner to add it."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {calendars.map((c) => (
            <li key={c.key} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {c.connected
                      ? `${c.googleEmail ?? "Connected"}${c.syncEnabled ? "" : " · paused"}${
                          c.lastSyncLabel ? ` · last synced ${c.lastSyncLabel}` : ""
                        }`
                      : "Not connected"}
                  </span>
                  {c.lastError ? (
                    <span className="mt-1 text-xs text-red-600 dark:text-red-400">{c.lastError}</span>
                  ) : null}
                </div>

                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    {c.connected ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => setGoogleSyncEnabled(c.key, !c.syncEnabled),
                              c.syncEnabled ? "Paused." : "Resumed.",
                            )
                          }
                        >
                          {c.syncEnabled ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmKey(confirmKey === c.key ? null : c.key)}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      // A plain link: connecting is a redirect to Google, which no
                      // server action can perform.
                      <a
                        href={`/api/google/connect?calendar=${encodeURIComponent(c.key)}&returnTo=${encodeURIComponent(returnTo)}`}
                        className={cn(
                          "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium",
                          "bg-green-600 text-white hover:bg-green-700",
                        )}
                      >
                        Connect
                      </a>
                    )}
                  </div>
                ) : null}
              </div>

              {confirmKey === c.key ? (
                <div className="flex flex-col gap-2 rounded-md border border-amber-500/60 p-3">
                  <p className="text-xs">
                    Disconnecting removes this app&apos;s access and deletes the stored tokens.{" "}
                    <strong>Events already in the calendar stay where they are</strong> - some of them
                    are tomorrow, and emptying a diary because an integration was unlinked would
                    destroy real information. Bookings simply stop appearing and stop blocking slots.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => disconnectGoogleCalendar(c.key), "Disconnected.")}
                    >
                      Disconnect it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmKey(null)}>
                      Keep it connected
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isPlatform && canEdit ? <GoogleAppForm configured={appConfigured} onDone={setMsg} /> : null}
    </section>
  );
}

/**
 * The platform's own OAuth app. Owner scope only.
 *
 * One Google Cloud project serves every workspace: a tenant clicks Connect and consents,
 * and is never asked for a client id, because they do not have one.
 */
function GoogleAppForm({
  configured,
  onDone,
}: {
  configured: boolean;
  onDone: (msg: string) => void;
}) {
  const [open, setOpen] = useState(!configured);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="self-start text-xs underline" onClick={() => setOpen(true)}>
        Platform: edit the Google app credentials
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Platform: Google app
      </h3>
      <p className="text-xs text-[var(--muted-foreground)]">
        From a Google Cloud project with the Calendar API enabled. The redirect URI to register
        there is this app&apos;s own address plus <strong>/api/google/callback</strong>, and only
        that one: Google matches it exactly, which is why connecting always happens on the platform
        domain even for a workspace on its own.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Client ID</Label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Client secret {configured ? "(blank keeps the saved one)" : ""}</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <div>
        <Button
          size="sm"
          disabled={pending || !clientId.trim()}
          onClick={() =>
            start(async () => {
              const r = await saveGoogleApp(clientId, clientSecret);
              onDone(r.ok ? "Google app saved." : r.error);
              if (r.ok) {
                setClientSecret("");
                setOpen(false);
              }
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

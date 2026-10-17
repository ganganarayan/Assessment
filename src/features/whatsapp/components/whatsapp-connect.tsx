"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { completeWhatsAppConnect, disconnectWhatsApp } from "@/features/whatsapp/actions";
import { type WhatsAppConnectView } from "@/features/whatsapp/types";

/**
 * The one click.
 *
 * Meta's Embedded Signup opens as a popup owned by Facebook: the business logs in
 * there, picks or creates their WhatsApp Business Account, and consents. We never see
 * their password, and they never see a credential - which is the whole point, because
 * the manual alternative (System user, permanent token, five pasted fields) is exactly
 * the path that asks a second business admin to approve every step.
 *
 * Two things come back, from two different places, and BOTH are needed:
 *   - a `code` on the FB.login callback, good for about 30 seconds
 *   - a window message carrying waba_id / phone_number_id / business_id
 * Order is not guaranteed, so the message is stashed in a ref and the callback fires
 * the server action. The code's short life is why there is no confirm step in between.
 *
 * The flow is pinned to Embedded Signup v4 by the CONFIGURATION id, not by anything
 * sent from here: Meta decides the version from the products that configuration
 * selects. v2 was retired on 15-10-2026.
 */

interface FbAuthResponse {
  code?: string;
}
interface FbLoginResponse {
  authResponse?: FbAuthResponse | null;
  status?: string;
}
interface FbSdk {
  init(params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }): void;
  login(cb: (r: FbLoginResponse) => void, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

/** What the popup posts back on its way through the flow. */
interface SignupMessage {
  type?: string;
  event?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
    current_step?: string;
    error_message?: string;
  };
}

export function WhatsAppConnect({ initial, canEdit = true }: { initial: WhatsAppConnectView; canEdit?: boolean }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(initial.lastError);
  const [connected, setConnected] = useState(initial.connected);
  const [pending, start] = useTransition();
  const session = useRef<SignupMessage["data"] | null>(null);

  // Meta's own guidance: ignore anything that is not from Facebook. Without this an
  // unrelated page in another tab could hand us ids we would then send to the server.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      let origin: string;
      try {
        origin = new URL(ev.origin).hostname;
      } catch {
        return;
      }
      if (origin !== "facebook.com" && !origin.endsWith(".facebook.com")) return;
      let parsed: SignupMessage;
      try {
        parsed = typeof ev.data === "string" ? (JSON.parse(ev.data) as SignupMessage) : (ev.data as SignupMessage);
      } catch {
        return;
      }
      if (parsed?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (parsed.data?.waba_id) session.current = parsed.data;
      // A CANCEL carries why, and the step they left on. Showing it beats a silent
      // nothing-happened, which is what an abandoned popup looks like otherwise.
      if (parsed.event === "CANCEL") {
        const why = parsed.data?.error_message ?? parsed.data?.current_step;
        setMsg(why ? `Meta stopped at: ${why}` : "You closed the WhatsApp window before it finished.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const initSdk = useCallback(() => {
    if (!window.FB) return;
    window.FB.init({ appId: initial.appId, cookie: true, xfbml: false, version: initial.graphVersion });
    setSdkReady(true);
  }, [initial.appId, initial.graphVersion]);

  const launch = () => {
    if (!window.FB) {
      setMsg("The Facebook library did not load. Check for an ad blocker and reload the page.");
      return;
    }
    setMsg(null);
    setNote(null);
    session.current = null;
    window.FB.login(
      (res) => {
        const code = res?.authResponse?.code;
        if (!code) {
          // No code means they closed it or declined. The CANCEL message handler has
          // usually already said something more specific than this.
          setMsg((m) => m ?? "WhatsApp was not connected. Nothing changed.");
          return;
        }
        const s = session.current;
        if (!s?.waba_id) {
          setMsg(
            "Meta did not tell us which WhatsApp account was connected, so nothing was saved. Try again, and keep this tab open until the window closes by itself.",
          );
          return;
        }
        start(async () => {
          const r = await completeWhatsAppConnect({
            code,
            wabaId: s.waba_id,
            phoneNumberId: s.phone_number_id ?? null,
            businessId: s.business_id ?? null,
          });
          if (!r.ok) {
            setMsg(r.error);
            return;
          }
          setMsg("WhatsApp connected.");
          setNote(r.data?.note ?? null);
          // The row the server just wrote is what the card should show, and a
          // revalidate alone will not refresh a client component's props.
          window.location.reload();
        });
      },
      {
        config_id: initial.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  };

  const unlink = () => {
    start(async () => {
      const r = await disconnectWhatsApp();
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setConnected(null);
      setMsg("WhatsApp disconnected.");
    });
  };

  if (!initial.ready) {
    return (
      <div className="rounded-md border border-dashed p-3">
        <p className="text-sm font-medium">One-click WhatsApp connection</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          🟡 Not available yet. The platform owner has to add the Meta app details before this can
          launch. Until then, the fields below still work if you already hold a Cloud API token.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        onLoad={initSdk}
        onReady={initSdk}
      />

      {connected ? (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {connected.displayPhone || connected.phoneNumberId}
              {connected.verifiedName ? ` - ${connected.verifiedName}` : ""}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {connected.isOnBizApp
                ? "🟢 Connected, and still live on the WhatsApp Business app on your phone."
                : "🟢 Connected to the Cloud API. This number is not shared with the phone app."}
              {connected.onboardedAt ? ` Connected ${connected.onboardedAt} IST.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={launch} disabled={pending || !canEdit}>
              Reconnect
            </Button>
            <Button size="sm" variant="outline" onClick={unlink} disabled={pending || !canEdit}>
              {pending ? "Working..." : "Disconnect"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Connect WhatsApp in one click</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Opens Meta, where you log in and pick your WhatsApp Business account. You keep using
              WhatsApp on your phone exactly as now. Nothing to copy, paste, or get approved.
            </p>
          </div>
          <div>
            <Button size="sm" onClick={launch} disabled={pending || !sdkReady || !canEdit}>
              {pending ? "Connecting..." : "Connect WhatsApp"}
            </Button>
          </div>
        </>
      )}

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
      {note ? <p className="text-sm text-[var(--muted-foreground)]">🟡 {note}</p> : null}
    </div>
  );
}

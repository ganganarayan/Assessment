"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { completeWhatsAppConnect, disconnectWhatsApp } from "@/features/whatsapp/actions";
import { type SignupFlow, type WhatsAppConnectView } from "@/features/whatsapp/types";

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
 *
 * 🔴 featureType is what makes COEXISTENCE possible at all. Sent with an empty setup
 * object and nothing else, Meta runs the clean Cloud API onboarding and never offers
 * the screen that takes a number already live on somebody's WhatsApp Business app -
 * which is the whole point of the feature. One word in `extras` is the difference
 * between "connect the number on my phone" and "give me a new number in the cloud".
 *
 * On a v5 configuration Meta turns this onboarding on by default and ignores the
 * parameter, so sending it is right either way; what would break v5 is sending the
 * opt-out, and that is deliberately absent.
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
  const [launched, setLaunched] = useState(false);
  const session = useRef<SignupMessage["data"] | null>(null);
  // Which finish event closed the popup. A hint for the server, never the record.
  const flow = useRef<SignupFlow>("CLOUD");

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
      // The coexistence path has its own finish event, and it is the only signal that
      // says the business connected the number from their phone rather than taking a
      // fresh cloud number. Meta documents its payload as carrying the WABA alone,
      // which is why the phone number id is looked up server-side instead.
      if (parsed.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") flow.current = "COEXISTENCE";
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
    setLaunched(true);
    session.current = null;
    flow.current = "CLOUD";
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
            flow: flow.current,
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
        extras: {
          // Offers the number already on their WhatsApp Business app. Without it Meta
          // hides that screen and only a new cloud number can be created.
          featureType: "whatsapp_business_app_onboarding",
          // Empty prefill: we know their WABA name and number no better than they do,
          // and a wrong prefill in Meta's own popup is not something we can correct.
          setup: {},
        },
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
            <p className="text-sm font-medium">Connect the number on your phone</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Opens Meta, where you log in and name the number you already use in WhatsApp
              Business. It keeps working on your phone exactly as now, and you can send from here
              too. Nothing to copy from a developer screen, and nobody has to approve it.
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              🟡 Keep that phone next to you. Meta asks you to confirm on it, and it needs
              WhatsApp Business version 2.24.17 or newer.
            </p>
          </div>
          <details open={launched} className="text-xs text-[var(--muted-foreground)]">
            <summary className="cursor-pointer font-medium">What Meta will ask you</summary>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4">
              <li>Choose to connect an account you already have, and type that phone number.</li>
              <li>Copy the code Meta shows you.</li>
              <li>On your phone, open the message from Facebook in WhatsApp and tap Connect.</li>
              <li>Tap Connect to the Business Platform.</li>
              <li>Choose whether to bring your past chats across.</li>
              <li>Paste the code back into the Meta window.</li>
              <li>Leave WhatsApp open on the phone until it finishes copying over.</li>
            </ol>
          </details>
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

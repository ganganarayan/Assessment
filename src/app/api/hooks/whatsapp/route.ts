import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { resolveMetaAppConfig } from "@/lib/settings/meta-app";
import { ingestWhatsAppWebhook, type WhatsAppWebhookBody } from "@/lib/whatsapp/inbound";

/**
 * Meta's webhook for the WhatsApp app.
 *
 * Required, not optional: Meta will not let a Tech Provider onboard business-app
 * (coexistence) customers unless the app has a callback that accepts and processes
 * webhooks, and the app has to be subscribed to history, smb_app_state_sync and
 * smb_message_echoes. So this endpoint exists to satisfy the contract and to prove the
 * callback is alive.
 *
 * Coexistence deliveries are stored: the owner's address book, their own past chats
 * and the echo of anything they send from the phone. That work is in lib/whatsapp
 * /inbound, including the rule that matters most - none of those people have opted in,
 * so none of them reach a broadcast audience unless the sender ticks them on.
 *
 * Anything else is still acknowledged and dropped. A field we do not handle is named
 * in the log and otherwise ignored, so a new Meta field cannot look like a failure.
 *
 * GET  = Meta's one-time verification handshake (hub.challenge).
 * POST = events, signed with the app secret.
 */

export const dynamic = "force-dynamic";

/** Meta retries anything that is not a 2xx, so an event we cannot use still gets a
 *  200. The only non-2xx here is an UNSIGNED request, which is not Meta. */
const OK = () => new NextResponse("EVENT_RECEIVED", { status: 200 });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const { webhookVerifyToken } = await resolveMetaAppConfig();
  // Fail closed. An unconfigured verify token must not accept the handshake, or
  // anybody who finds this URL can subscribe their own app to it.
  if (!webhookVerifyToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (mode !== "subscribe" || token !== webhookVerifyToken || !challenge) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }
  // Meta wants the challenge echoed as PLAIN TEXT, not JSON.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/** Constant-time compare that cannot throw on a length mismatch. */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // The signature is over the RAW body, so it has to be read as text before any
  // JSON.parse - re-serializing changes the bytes and every signature fails.
  const raw = await req.text();
  const header = req.headers.get("x-hub-signature-256") ?? "";

  const { appSecret } = await resolveMetaAppConfig();
  if (!appSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const expected = "sha256=" + createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  if (!header || !signatureMatches(expected, header)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  // Signed and genuine. Store it, and log COUNTS and field names only - never the
  // payload, which is somebody's conversation and a log is the easiest place to leak
  // one.
  //
  // 🔴 Every failure below still answers 200. Meta retries anything that is not a
  // 2xx, so a bug here would have it redeliver the same chunk until the sync window
  // runs out, which turns our bug into the owner losing their chat history.
  try {
    const body = JSON.parse(raw) as WhatsAppWebhookBody;
    const r = await ingestWhatsAppWebhook(body);
    console.log(
      "[whatsapp-hook] contacts=" +
        r.contacts +
        " messages=" +
        r.messages +
        (r.skipped.length ? " skipped=" + r.skipped.join(",") : ""),
    );
  } catch (e) {
    console.error("[whatsapp-hook] delivery dropped:", e instanceof Error ? e.message : String(e));
  }

  return OK();
}

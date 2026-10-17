import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { resolveMetaAppConfig } from "@/lib/settings/meta-app";

/**
 * Meta's webhook for the WhatsApp app.
 *
 * Required, not optional: Meta will not let a Tech Provider onboard business-app
 * (coexistence) customers unless the app has a callback that accepts and processes
 * webhooks, and the app has to be subscribed to history, smb_app_state_sync and
 * smb_message_echoes. So this endpoint exists to satisfy the contract and to prove the
 * callback is alive.
 *
 * 🟡 It deliberately does NOT act on message content yet. Inbound replies, contact
 * history import and message echoes are their own feature with their own storage and
 * consent questions; pretending to handle them here would mean quietly keeping other
 * people's WhatsApp conversations in our database. Events are acknowledged, counted by
 * field name, and dropped.
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

interface WebhookEntry {
  changes?: Array<{ field?: string }>;
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

  // Signed and genuine. Count what arrived by FIELD NAME only: that is enough to see
  // in the logs that the subscription is live, and it carries nobody's message text,
  // phone number or name.
  try {
    const body = JSON.parse(raw) as { entry?: WebhookEntry[] };
    const fields = (body.entry ?? [])
      .flatMap((e) => e.changes ?? [])
      .map((c) => c.field ?? "unknown")
      .join(",");
    if (fields) console.log("[whatsapp-hook] received:", fields);
  } catch {
    // A body we cannot parse is still Meta's, and still gets a 200 - retrying it
    // would not make it parseable.
    console.warn("[whatsapp-hook] signed body was not JSON");
  }

  return OK();
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { signWebhookBody } from "@/lib/webhooks/sign";

const TIMEOUT_MS = 10_000;

export interface DeliverArgs {
  url: string;
  secret: string;
  eventName: string;
  /** Exact JSON string that is signed and sent (and stored for retry fidelity). */
  body: string;
  endpointId?: string | null;
  submissionId?: string | null;
  attempt?: number;
}

export interface DeliverResult {
  success: boolean;
  responseStatus: number | null;
  logId: string;
}

/**
 * POST a signed webhook and record exactly one WebhookLog row for the attempt.
 * Never throws — failures are captured in the log so callers can fire-and-forget.
 */
export async function deliverWebhook(args: DeliverArgs): Promise<DeliverResult> {
  const { url, secret, eventName, body } = args;

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  let success = false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-assess-event": eventName,
        "x-assess-signature": signWebhookBody(secret, body),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    responseStatus = res.status;
    responseBody = (await res.text()).slice(0, 4000);
    success = res.ok;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const log = await prisma.webhookLog.create({
    data: {
      eventName,
      endpoint: url,
      payload: JSON.parse(body) as Prisma.InputJsonValue,
      responseStatus,
      responseBody,
      error,
      attemptCount: args.attempt ?? 1,
      success,
      webhookEndpointId: args.endpointId ?? null,
      submissionId: args.submissionId ?? null,
    },
    select: { id: true },
  });

  return { success, responseStatus, logId: log.id };
}

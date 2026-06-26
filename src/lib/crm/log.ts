import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type CrmSendResult } from "@/lib/crm/send";

/** Prefix that marks a WebhookLog row as a CRM send (vs a lifecycle webhook). */
export const CRM_LOG_PREFIX = "crm:";

/**
 * Log one CRM send to WebhookLog (the same store + UI the lifecycle webhooks use).
 * eventName = "crm:<name>" so the CRM Sends view can filter, and the display name
 * is the editable sender name ("CRM send" / "Diagnosis" / …). Best-effort.
 */
export async function logCrmSend(args: {
  name: string;
  submissionId: string;
  attempts: number;
  res: CrmSendResult;
}): Promise<void> {
  await prisma.webhookLog
    .create({
      data: {
        eventName: `${CRM_LOG_PREFIX}${args.name}`,
        endpoint: args.res.url ?? "(no url configured)",
        payload: (args.res.payload ?? {}) as Prisma.InputJsonValue,
        responseStatus: args.res.status ?? null,
        responseBody: null,
        error: args.res.error ?? null,
        attemptCount: args.attempts,
        success: !!args.res.ok,
        submissionId: args.submissionId,
      },
    })
    .catch(() => {});
}

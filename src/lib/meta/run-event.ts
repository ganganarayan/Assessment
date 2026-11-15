// Not `server-only`: the abandon sweep reaches this through capi-log from a tsx cron,
// outside Next. Prisma in the import chain already keeps it out of any browser bundle.
import { prisma } from "@/lib/db/prisma";
import type { CapiEventInput } from "@/lib/meta/capi";

/** What happened to one server send, as the run log records it. */
export type CapiRunStatus = "sent" | "failed" | "test_sent" | "test_failed" | "would_fire" | "skipped";
/** What happened to one browser pixel event. */
export type PixelRunStatus = "fired" | "would_fire" | "not_loaded";

/**
 * Write one server send to the per-run event log. Only events that say which run they
 * belong to (CapiEventInput.run) are logged, and a failure to log never touches the
 * send: this is a record, not part of the path to Meta.
 */
export async function logCapiRunEvent(
  input: CapiEventInput,
  status: CapiRunStatus,
  detail: { httpStatus?: number | null; response?: string | null } = {},
): Promise<void> {
  const run = input.run;
  if (!run) return;
  const visitorId = (run.visitorId ?? input.user.externalId ?? "").trim().slice(0, 64);
  if (!visitorId) return;
  await prisma.runEvent
    .create({
      data: {
        tenantId: run.tenantId,
        assessmentId: run.assessmentId,
        visitorId,
        source: "capi",
        eventName: input.eventName.slice(0, 100),
        eventId: input.eventId.slice(0, 200),
        isPreview: input.preview === true,
        status,
        httpStatus: detail.httpStatus ?? null,
        response: detail.response ? detail.response.slice(0, 800) : null,
      },
    })
    .catch(() => {});
}

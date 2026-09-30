import { env } from "@/lib/env";

/**
 * Render a PDF report on the WORKER instead of in this process.
 *
 * THE WORKER IS THIS SAME APP, DEPLOYED TWICE. A second Railway service built from the
 * same repo, with REPORT_WORKER_URL pointing at it. No separate codebase, no duplicated
 * render logic, no second build to keep in step — the only difference between the two
 * services is which one receives public traffic.
 *
 * WHY BOTHER, IF IT IS THE SAME CODE: react-pdf lays out the document and buffers the
 * whole file in memory, and a few concurrent renders is a realistic out-of-memory on a
 * small container. In one process that OOM takes the funnel down with the admin. Split
 * in two, it kills a worker that nobody's respondent is talking to, and the app gets a
 * failed fetch it can fall back from.
 *
 * DEGRADES TO TODAY'S BEHAVIOUR. With REPORT_WORKER_URL unset — or the worker down,
 * slow, or erroring — the caller renders in-process exactly as before. So deploying the
 * worker is an improvement you opt into, not a dependency that can take reports out.
 */

/** How long to wait on the worker before giving up and rendering locally. */
const WORKER_TIMEOUT_MS = 25_000;

/** True when a worker is configured AND this process is not itself the worker. */
export function workerConfigured(): boolean {
  // IS_REPORT_WORKER is set on the worker service only. Without this check a worker
  // that inherited the same variables would call itself, forever.
  return !!env.REPORT_WORKER_URL && !!env.REPORT_WORKER_SECRET && env.IS_REPORT_WORKER !== "1";
}

/**
 * Ask the worker for a submission's PDF. Returns the bytes, or null to mean
 * "render it yourself" — every failure is a null, never a throw, because the caller's
 * fallback is always better than an error page.
 */
export async function renderOnWorker(submissionId: string): Promise<Uint8Array | null> {
  if (!workerConfigured()) return null;

  const url = `${env.REPORT_WORKER_URL!.replace(/\/+$/, "")}/api/reports/${encodeURIComponent(submissionId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      // The shared secret is the worker's whole authorisation story, so the worker must
      // not be reachable from the internet without it. See the route's internal branch.
      headers: { "x-internal-render": env.REPORT_WORKER_SECRET as string },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[reports] worker returned ${res.status}; rendering locally`);
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    const why = e instanceof Error ? e.name : String(e);
    console.error(`[reports] worker unreachable (${why}); rendering locally`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { storage, tenantKey, isStorageConfigured } from "@/lib/storage/r2";

/**
 * Where a rendered PDF report lives, and how it gets there.
 *
 * THREE PROBLEMS THIS SOLVES, IN ORDER OF HOW MUCH THEY COST
 *
 * 1. Every view re-rendered the PDF. react-pdf lays out the document, loads fonts and
 *    buffers the whole file in the app process, on every single request for the same
 *    unchanged report. Storing it means that happens once.
 *
 * 2. Rendering in the app process can take the app down. A few concurrent renders is a
 *    realistic out-of-memory on a small container, and an OOM kills the funnel along
 *    with the admin. Rendering moves to a worker (see worker.ts).
 *
 * 3. Nothing may reveal where a file sits. The object key is never returned to any
 *    client — not in HTML, JSON, headers or a redirect. Reports are STREAMED through
 *    the authorising route, so no bucket URL and no signed link ever reaches a browser.
 *
 * WHY THE FILE NAME IS RANDOM
 * The obvious key is `tenants/<tenantId>/reports/<submissionId>.pdf`, and it is a quiet
 * mistake: submission ids appear in admin URLs, so anyone who has seen one has seen a
 * key, and the pattern makes the rest of the bucket walkable by guessing ids. A random
 * name means a leaked key reveals exactly one file and implies nothing about any other.
 * The tenant folder stays, because it is what makes per-tenant lifecycle rules and
 * bulk deletion possible — and no tenant ever sees it.
 */

/** Per-tenant folder, random file name. Never shown to a client. */
function newReportKey(tenantId: string): string {
  return tenantKey(tenantId, `reports/${randomBytes(16).toString("hex")}.pdf`);
}

/**
 * The stored report for a submission, or null if there isn't one.
 *
 * A key that no longer resolves in the bucket is treated as "not stored" and CLEARED,
 * so the next request re-renders instead of failing forever against a file someone
 * removed out of band.
 */
export async function getStoredReport(submissionId: string): Promise<Uint8Array | null> {
  if (!(await isStorageConfigured())) return null;

  const row = await prisma.submission
    .findUnique({ where: { id: submissionId }, select: { reportKey: true } })
    .catch(() => null);
  if (!row?.reportKey) return null;

  const bytes = await storage.download(row.reportKey);
  if (bytes) return bytes;

  await prisma.submission
    .update({ where: { id: submissionId }, data: { reportKey: null } })
    .catch(() => {});
  return null;
}

/**
 * Store a rendered report and remember where it went.
 *
 * Best-effort by design: if this fails the caller has already produced the bytes and
 * should still serve them. A storage outage must slow the next request down, never
 * withhold a report that has been generated.
 *
 * Returns the key, or null if nothing was stored.
 */
export async function putStoredReport(
  submissionId: string,
  tenantId: string | null,
  bytes: Uint8Array,
): Promise<string | null> {
  // An unowned submission (pre re-home) has no tenant folder to write into. Rather than
  // invent one, it simply is not cached — it still renders and serves normally, and it
  // starts being cached once the re-home gives it a tenant.
  if (!tenantId) return null;
  if (!(await isStorageConfigured())) return null;

  const key = newReportKey(tenantId);
  try {
    await storage.upload({ key, body: bytes, contentType: "application/pdf" });
    await prisma.submission.update({ where: { id: submissionId }, data: { reportKey: key } });
    return key;
  } catch (e) {
    console.error("[reports] store failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Forget a submission's stored report, deleting the object.
 *
 * Call whenever the RESULT changes — a retake, a recomputed score, a regenerated AI
 * statement. Without this the stored PDF keeps being served after the result it
 * describes has moved on, which is worse than a slow report: it is a confidently wrong
 * one, and nothing about it looks stale.
 *
 * Deletes the object as well as the pointer, so a superseded report cannot be recovered
 * from the bucket later and does not accumulate storage cost.
 */
export async function clearStoredReport(submissionId: string): Promise<void> {
  const row = await prisma.submission
    .findUnique({ where: { id: submissionId }, select: { reportKey: true } })
    .catch(() => null);
  if (!row?.reportKey) return;

  await prisma.submission
    .update({ where: { id: submissionId }, data: { reportKey: null } })
    .catch(() => {});
  // Pointer first, object second: if the delete fails, the row already points at
  // nothing, so a stale file is orphaned rather than still being served.
  await storage.delete(row.reportKey).catch(() => {});
}

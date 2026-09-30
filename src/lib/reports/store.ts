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
 * Retire a submission's stored report because its RESULT changed.
 *
 * Call after a retake, a recomputed score, or a regenerated / re-chosen AI statement.
 * Without it the stored PDF keeps being served after the result it describes has moved
 * on — which is worse than a slow report, because a confidently wrong document looks
 * exactly like a correct one.
 *
 * KEEPS THE LATEST TWO, and does it by rotation:
 *   - whatever sat in `reportPrevKey` is now the third-newest, so its object is deleted
 *   - the current report becomes `reportPrevKey` — kept, so a regeneration that turns
 *     out worse can be rolled back
 *   - `reportKey` is cleared, so the next request renders the new result
 *
 * The delete happens FIRST and the row is updated second. If the delete fails, the
 * pointer still moves and one file is orphaned in the bucket — the alternative ordering
 * would leave a row pointing at an object that is already gone, which is the failure
 * that actually hurts because it breaks rollback.
 *
 * Never throws: a result change must not fail because a cache could not be rotated.
 */
export async function supersedeStoredReport(submissionId: string): Promise<void> {
  const row = await prisma.submission
    .findUnique({ where: { id: submissionId }, select: { reportKey: true, reportPrevKey: true } })
    .catch(() => null);
  // Nothing rendered and nothing retained: there is no rotation to do. Checked so a
  // recompute over thousands of submissions does no writes for the ones without reports.
  if (!row || (!row.reportKey && !row.reportPrevKey)) return;

  if (row.reportPrevKey) {
    await storage.delete(row.reportPrevKey).catch((e) => {
      console.error("[reports] pruning the third-newest report failed:", e instanceof Error ? e.message : String(e));
    });
  }
  await prisma.submission
    .update({
      where: { id: submissionId },
      data: { reportPrevKey: row.reportKey, reportKey: null },
    })
    .catch(() => {});
}

/** Retire the reports for several submissions — the bulk paths (recompute, AI rerun).
 *  Sequential on purpose: this runs after the real work and must not add a burst of
 *  concurrent storage deletes on top of it. */
export async function supersedeStoredReports(submissionIds: string[]): Promise<void> {
  for (const id of submissionIds) await supersedeStoredReport(id);
}

/**
 * Put the previous report back as the current one.
 *
 * SWAPS rather than copies, so the report that was current becomes the previous — which
 * means rollback is reversible and an operator who rolls back by mistake is not stuck.
 * Neither object is deleted, so the pair is still exactly two.
 *
 * Returns false when there is nothing to roll back to, so the caller can say so instead
 * of reporting a success that changed nothing.
 */
export async function rollbackStoredReport(submissionId: string): Promise<boolean> {
  const row = await prisma.submission
    .findUnique({ where: { id: submissionId }, select: { reportKey: true, reportPrevKey: true } })
    .catch(() => null);
  if (!row?.reportPrevKey) return false;

  await prisma.submission.update({
    where: { id: submissionId },
    data: { reportKey: row.reportPrevKey, reportPrevKey: row.reportKey },
  });
  return true;
}

import "server-only";
import { CrmSendKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendScoreUpdate, sendCustomUpdate } from "@/lib/crm/send";
import { logCrmSend } from "@/lib/crm/log";
import { istHour, inWindow, msUntilWindowOpen, randomDelayMs } from "@/lib/crm/window";

/**
 * Background CRM send workers. One independent loop per kind (SCORE, CUSTOM).
 * Each drains its PENDING jobs from CrmSendQueue oldest-first, but ONLY inside its
 * configured daily IST window, waiting a fresh random [min,max]-minute delay between
 * sends. Runs in-process on the single Railway replica (the persistent Node server
 * keeps the floating promise alive), so the owner can close the page / shut their PC.
 *
 * Concurrency safety:
 *  - Atomic claim: a row is sent only by the loop that flips it PENDING -> SENDING
 *    (conditional updateMany), so even two briefly-overlapping loops never double-send.
 *  - Generation token: each started loop gets a fresh `gen`; it runs only while it is
 *    the current generation, so a Stop/restart supersedes it and it exits — never two
 *    live loops for one kind.
 *  - The persisted "armed" flag (crmDripActive / crmCustomActive) is set false ONLY by
 *    an explicit Stop or by boot reconciliation (armed + nothing pending). The loop's
 *    finally never writes it, so a finally-vs-Start race can't strand a stale flag.
 *
 * Survives deploys: instrumentation calls resumeDripOnBoot() on every start, which
 * resets orphaned SENDING rows (crash mid-send) to FAILED — never silently re-sent,
 * important because SCORE fires WhatsApp — and re-arms each armed kind with pending
 * work. A row is marked SENT right after a successful POST, then the delay runs, so a
 * restart during the (long) gap loses/repeats nothing. Single replica only.
 */

const MAX_ATTEMPTS = 3;
const WINDOW_RECHECK_MS = 15 * 60_000; // cap window-closed sleep so Stop/edits are seen

const running: Record<CrmSendKind, boolean> = {
  [CrmSendKind.SCORE]: false,
  [CrmSendKind.CUSTOM]: false,
};
const current: Record<CrmSendKind, number> = {
  [CrmSendKind.SCORE]: 0,
  [CrmSendKind.CUSTOM]: 0,
};
let genSeq = 0;

const ACTIVE_FIELD: Record<CrmSendKind, "crmDripActive" | "crmCustomActive"> = {
  [CrmSendKind.SCORE]: "crmDripActive",
  [CrmSendKind.CUSTOM]: "crmCustomActive",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sleep in short steps so Stop / config changes are honored within ~15s. */
async function interruptibleSleep(kind: CrmSendKind, gen: number, ms: number): Promise<void> {
  const step = 15_000;
  let waited = 0;
  while (waited < ms && current[kind] === gen) {
    await sleep(Math.min(step, ms - waited));
    waited += step;
  }
}

interface KindConfig {
  startHour: number;
  endHour: number;
  min: number;
  max: number;
  name: string;
}

async function readConfig(kind: CrmSendKind): Promise<KindConfig> {
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      crmScoreStartHour: true,
      crmScoreEndHour: true,
      crmScoreDelayMin: true,
      crmScoreDelayMax: true,
      crmCustomName: true,
      crmCustomStartHour: true,
      crmCustomEndHour: true,
      crmCustomDelayMin: true,
      crmCustomDelayMax: true,
    },
  });
  if (kind === CrmSendKind.SCORE) {
    return {
      startHour: s?.crmScoreStartHour ?? 9,
      endHour: s?.crmScoreEndHour ?? 21,
      min: s?.crmScoreDelayMin ?? 10,
      max: s?.crmScoreDelayMax ?? 12,
      name: "CRM send",
    };
  }
  return {
    startHour: s?.crmCustomStartHour ?? 9,
    endHour: s?.crmCustomEndHour ?? 21,
    min: s?.crmCustomDelayMin ?? 10,
    max: s?.crmCustomDelayMax ?? 12,
    name: s?.crmCustomName ?? "Diagnosis",
  };
}

async function setActive(kind: CrmSendKind, val: boolean): Promise<void> {
  await prisma.appSetting
    .update({ where: { id: "singleton" }, data: { [ACTIVE_FIELD[kind]]: val } })
    .catch(() => {});
}

export function isWorkerRunning(kind: CrmSendKind): boolean {
  return running[kind];
}

async function loop(kind: CrmSendKind, gen: number): Promise<void> {
  try {
    while (current[kind] === gen) {
      const next = await prisma.crmSendQueue.findFirst({
        where: { kind, status: "PENDING", attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { queuedAt: "asc" },
        select: { id: true, submissionId: true, attempts: true },
      });
      if (!next) break; // queue for this kind drained

      const cfg = await readConfig(kind);

      // Window gate — pause until the IST window next opens (capped so Stop/edits are
      // seen), then re-check. Nothing is claimed while closed.
      if (!inWindow(istHour(), cfg.startHour, cfg.endHour)) {
        await interruptibleSleep(kind, gen, Math.min(msUntilWindowOpen(new Date(), cfg.startHour), WINDOW_RECHECK_MS));
        continue;
      }

      // Atomic claim: only the loop that flips PENDING -> SENDING owns this send.
      const claim = await prisma.crmSendQueue.updateMany({
        where: { id: next.id, status: "PENDING" },
        data: { status: "SENDING" },
      });
      if (claim.count === 0) continue; // claimed/changed by someone else

      const res = kind === CrmSendKind.SCORE
        ? await sendScoreUpdate(next.submissionId)
        : await sendCustomUpdate(next.submissionId);

      await logCrmSend({ name: cfg.name, submissionId: next.submissionId, attempts: next.attempts + 1, res });

      if (res.ok || res.skipped) {
        await prisma.crmSendQueue.update({
          where: { id: next.id },
          data: { status: "SENT", sentAt: new Date(), lastError: res.skipped ? `skipped: ${res.error ?? ""}`.slice(0, 500) : null },
        });
        if (kind === CrmSendKind.SCORE && res.ok) {
          await prisma.submission
            .update({ where: { id: next.submissionId }, data: { crmDirty: false, crmSentAt: new Date(), crmLastError: null, crmAttempts: 0, crmQueuedAt: null } })
            .catch(() => {});
        }
      } else {
        const attempts = next.attempts + 1;
        await prisma.crmSendQueue.update({
          where: { id: next.id },
          data: { status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", attempts, lastError: (res.error ?? "send failed").slice(0, 500) },
        });
      }

      if (current[kind] !== gen) break;
      await interruptibleSleep(kind, gen, randomDelayMs(cfg.min, cfg.max));
    }
  } catch {
    // Never let the loop throw; it ends and can be restarted/resumed.
  } finally {
    // Only the still-current loop drops the in-memory flag. The persisted flag is
    // left to Stop / boot reconciliation, so this can't race a concurrent Start.
    if (current[kind] === gen) running[kind] = false;
  }
}

/** Start (or no-op if already running) the worker for one kind. */
export async function startWorker(kind: CrmSendKind): Promise<void> {
  if (running[kind]) return;
  running[kind] = true;
  const gen = ++genSeq;
  current[kind] = gen;
  await setActive(kind, true);
  void loop(kind, gen);
}

/** Request stop; supersedes the live loop (exits within ~15s) and disarms. */
export async function stopWorker(kind: CrmSendKind): Promise<void> {
  running[kind] = false;
  current[kind] = ++genSeq; // supersede so the live loop exits
  await setActive(kind, false);
}

/**
 * Called on server boot (instrumentation). Resets orphaned SENDING rows (crash
 * mid-send) to FAILED so we never silently re-send, then re-arms each kind that was
 * left armed and still has pending jobs; disarms an armed-but-empty kind.
 */
export async function resumeDripOnBoot(): Promise<void> {
  try {
    await prisma.crmSendQueue
      .updateMany({ where: { status: "SENDING" }, data: { status: "FAILED", lastError: "interrupted by restart — retry to resend" } })
      .catch(() => {});

    const s = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { crmDripActive: true, crmCustomActive: true },
    });
    const activeByKind: Record<CrmSendKind, boolean> = {
      [CrmSendKind.SCORE]: !!s?.crmDripActive,
      [CrmSendKind.CUSTOM]: !!s?.crmCustomActive,
    };

    for (const kind of [CrmSendKind.SCORE, CrmSendKind.CUSTOM]) {
      if (running[kind] || !activeByKind[kind]) continue;
      const pending = await prisma.crmSendQueue.count({ where: { kind, status: "PENDING", attempts: { lt: MAX_ATTEMPTS } } });
      if (pending > 0) {
        running[kind] = true;
        const gen = ++genSeq;
        current[kind] = gen;
        void loop(kind, gen);
      } else {
        await setActive(kind, false);
      }
    }
  } catch {
    // Boot resume is best-effort; the owner can always click Start.
  }
}

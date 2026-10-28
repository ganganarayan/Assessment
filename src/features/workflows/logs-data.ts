import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { contactTenantOf } from "@/lib/contacts/tenant";
import { TRIGGER_LABEL } from "@/features/workflows/types";
import type { WorkflowRunStatusValue } from "@/features/workflows/types";

/**
 * What happened to each person who entered a sequence.
 *
 * 🔴 ONE ROW PER JOURNEY, NOT PER SEND. A list of sends is what the database has and it
 * is the wrong shape to read: five hundred rows in time order, with one person's five
 * messages scattered through a fortnight of everybody else's. The question an owner
 * actually asks is "what happened to this person", so the run is the row and its sends
 * hang underneath it.
 *
 * 🟡 The step KIND comes from the step, never from WorkflowSend.channel. Every send row
 * carries a channel because the column is required, so a tag change or a webhook call
 * records itself as EMAIL - which is harmless in the database and a lie on a screen.
 */

export interface JourneySend {
  id: string;
  /** What the step was: EMAIL, WHATSAPP, TAG, WEBHOOK, NOTIFY ME, and so on. */
  what: string;
  status: string;
  toAddress: string | null;
  error: string | null;
  at: string;
}

export interface JourneyRow {
  id: string;
  workflowId: string;
  workflowName: string;
  /**
   * WHICH WAY IN STARTED THEM, in the owner's words. Null on a run from before there
   * was more than one, where guessing would be worse than saying nothing.
   *
   * The reason the column exists: with five trigger boxes on a sequence, nothing else
   * on this row can answer "why is this person in here", and the event that enrolled
   * them is long gone by the time anybody asks.
   */
  startedBy: string | null;
  /** Who it is about: the contact, or the workspace on a tenant-nurture sequence. */
  who: string;
  /** True when the subject is a workspace rather than a lead. */
  aboutWorkspace: boolean;
  status: WorkflowRunStatusValue;
  /** Human reason it stopped early, when there is one. */
  stopReason: string | null;
  lastError: string | null;
  /** 1-based, so "step 3 of 5" reads the way the builder numbers them. */
  stepNumber: number;
  totalSteps: number;
  startedLabel: string;
  finishedLabel: string | null;
  /** When the next step is due, on a run still in progress. */
  dueLabel: string | null;
  sends: JourneySend[];
}

/** What a step did, said in the words the builder uses. */
function stepWhat(kind: string, channel: string | null): string {
  if (kind === "MESSAGE") return channel === "WABA" ? "WhatsApp" : "Email";
  if (kind === "DELAY") return "Wait";
  if (kind === "TAG") return "Tag";
  if (kind === "SUBFLOW") return "Call workflow";
  if (kind === "WEBHOOK") return "Webhook";
  if (kind === "NOTIFY_OWNER") return "Notify me";
  if (kind === "UNSUBSCRIBE") return "Unsubscribe";
  if (kind === "EXIT") return "End";
  return kind;
}

export async function listJourneys(scopeTenantId: string | null, limit = 100): Promise<JourneyRow[]> {
  const tenantId = contactTenantOf(scopeTenantId);

  const runs = await prisma.workflowRun.findMany({
    where: { tenantId },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 300),
    select: {
      id: true,
      workflowId: true,
      status: true,
      currentStep: true,
      stopReason: true,
      lastError: true,
      startedAt: true,
      finishedAt: true,
      dueAt: true,
      startedByTrigger: true,
      contact: { select: { id: true, firstName: true, lastName: true, email: true, mobile: true } },
      subjectTenant: { select: { name: true } },
      workflow: { select: { name: true, steps: { select: { id: true } } } },
    },
  });
  if (runs.length === 0) return [];

  // One query for every send in this page of runs rather than one per run: a hundred
  // journeys would otherwise be a hundred round trips to draw one screen.
  const sends = await prisma.workflowSend.findMany({
    where: { tenantId, workflowId: { in: [...new Set(runs.map((r) => r.workflowId))] } },
    // 🔴 CAPPED, AND NEWEST FIRST. Unbounded, a popular sequence with months of history
    // would pull every send it had ever made to draw one page of a hundred journeys -
    // a screen that gets slower every week and eventually does not load at all. Newest
    // first so the cap drops the oldest rows, which are the ones nobody opened the page
    // to read; the steps within a journey are put back in order below.
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true,
      contactId: true,
      workflowId: true,
      status: true,
      toAddress: true,
      error: true,
      channel: true,
      createdAt: true,
      step: { select: { kind: true, channel: true } },
    },
  });

  // 🟡 Keyed on (workflow, contact) because that is all a send row carries - it has no
  // run id. A contact who went through the same sequence twice therefore sees both
  // passes under both runs. Worth knowing rather than worth hiding: the alternative is
  // a schema change, and showing a few extra rows is better than dropping real ones.
  const byKey = new Map<string, typeof sends>();
  for (const s of sends) {
    const key = `${s.workflowId}::${s.contactId ?? ""}`;
    const list = byKey.get(key);
    if (list) list.push(s);
    else byKey.set(key, [s]);
  }

  return runs.map((r): JourneyRow => {
    const c = r.contact;
    const who = c
      ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email || c.mobile || "Someone"
      : (r.subjectTenant?.name ?? "A workspace");
    const mine = byKey.get(`${r.workflowId}::${c?.id ?? ""}`) ?? [];
    return {
      id: r.id,
      workflowId: r.workflowId,
      workflowName: r.workflow.name,
      startedBy: r.startedByTrigger ? (TRIGGER_LABEL[r.startedByTrigger] ?? null) : null,
      who,
      aboutWorkspace: !c,
      status: r.status as WorkflowRunStatusValue,
      stopReason: r.stopReason,
      lastError: r.lastError,
      stepNumber: r.currentStep + 1,
      totalSteps: r.workflow.steps.length,
      startedLabel: formatIST(r.startedAt),
      finishedLabel: r.finishedAt ? formatIST(r.finishedAt) : null,
      // Only meaningful while it is still going; a finished run's dueAt is just the
      // last time it was touched, and showing that as "next" would read as stuck.
      dueLabel: r.status === "PENDING" || r.status === "SENDING" ? formatIST(r.dueAt) : null,
      sends: [...mine].reverse().map(
        (s): JourneySend => ({
          id: s.id,
          what: stepWhat(s.step?.kind ?? "", s.step?.channel ?? s.channel),
          status: s.status,
          toAddress: s.toAddress,
          error: s.error,
          at: formatIST(s.createdAt),
        }),
      ),
    };
  });
}

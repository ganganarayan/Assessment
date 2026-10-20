import { z } from "zod";
import type {
  WorkflowChannel,
  WorkflowDelayUnit,
  WorkflowStatus,
  WorkflowStepKind,
  WorkflowTagAction,
  WorkflowTrigger,
} from "@prisma/client";

/**
 * Shapes, labels and validation for the workflow builder. A PLAIN module: no
 * "use server", no DB, no secrets, so the builder can import it.
 *
 * The trigger registry lives here and is the extension point - adding one is a row in
 * TRIGGERS plus a fireWorkflowTrigger call at the place the thing actually happens,
 * not a new screen.
 */

export interface TriggerSpec {
  value: WorkflowTrigger;
  label: string;
  /** What it fires on, in the owner's words. Shown under the choice. */
  hint: string;
  /** True when the trigger needs a band picked alongside it. */
  needsBand?: boolean;
  /** True when it needs a tag picked alongside it. */
  needsTag?: boolean;
}

export const TRIGGERS: TriggerSpec[] = [
  {
    value: "CONTACT_OPTED_IN",
    label: "They opt in",
    hint: "The moment somebody gives their details. The start of everything.",
  },
  {
    value: "ASSESSMENT_COMPLETED",
    label: "They finish the assessment",
    hint: "They answered the last question and got their result.",
  },
  {
    value: "GATE_QUALIFIED",
    label: "They pass the gate",
    hint: "They qualified on page one, whether or not they went on.",
  },
  {
    value: "BAND_REACHED",
    label: "They land in a band",
    hint: "Their score put them in one band. The sequence can differ by how they scored.",
    needsBand: true,
  },
  {
    value: "TAG_ADDED",
    label: "A tag is added",
    hint: "How one sequence hands somebody to the next.",
    needsTag: true,
  },
];

export const TRIGGER_LABEL: Record<WorkflowTrigger, string> = Object.fromEntries(
  TRIGGERS.map((t) => [t.value, t.label]),
) as Record<WorkflowTrigger, string>;

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Live",
  PAUSED: "Paused",
};

export const STATUS_CLASS: Record<WorkflowStatus, string> = {
  DRAFT: "border-[var(--field-border)] text-[var(--muted-foreground)]",
  PUBLISHED: "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
  PAUSED: "border-amber-500/60 text-amber-600 dark:text-amber-400",
};

export const DELAY_UNITS: { value: WorkflowDelayUnit; label: string }[] = [
  { value: "MINUTES", label: "minutes" },
  { value: "HOURS", label: "hours" },
  { value: "DAYS", label: "days" },
  { value: "MONTHS", label: "months" },
];

/** What a message can say beyond the lead's own fields. */
export const WORKFLOW_PLACEHOLDERS = [
  "firstName",
  "lastName",
  "name",
  "email",
  "mobile",
  "profession",
  "unsubscribeUrl",
] as const;

/* ------------------------------------------------------------------ views --- */

export interface WorkflowStepView {
  id: string;
  displayOrder: number;
  kind: WorkflowStepKind;
  channel: WorkflowChannel | null;
  subject: string;
  body: string;
  wabaTemplate: string;
  wabaLang: string;
  wabaVars: string[];
  delayAmount: number | null;
  delayUnit: WorkflowDelayUnit | null;
  tagId: string | null;
  tagAction: WorkflowTagAction | null;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface WorkflowView {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  status: WorkflowStatus;
  assessmentId: string | null;
  bandKey: string | null;
  triggerTagId: string | null;
  steps: WorkflowStepView[];
  /** People currently partway through, and people who finished. */
  activeRuns: number;
  doneRuns: number;
}

export interface WorkflowListRow {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  status: WorkflowStatus;
  stepCount: number;
  activeRuns: number;
  /** DD-MM-YYYY HH:MM IST, formatted on the server. */
  createdAt: string;
}

export interface BuilderOptions {
  assessments: { id: string; title: string }[];
  tags: { id: string; name: string }[];
  /** Approved templates, with how many variables each body expects, so the builder
   *  can render exactly that many boxes instead of guessing. Empty when the Graph
   *  call failed, which falls back to typing the name by hand. */
  wabaTemplates: { name: string; varCount: number }[];
  /** False when WhatsApp is held back or unconfigured: the channel is not offered. */
  wabaAvailable: boolean;
}

/* ------------------------------------------------------------- validation --- */

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80),
  trigger: z.enum(["CONTACT_OPTED_IN", "ASSESSMENT_COMPLETED", "GATE_QUALIFIED", "BAND_REACHED", "TAG_ADDED"]),
});

export const workflowSettingsSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Give it a name.").max(80),
  assessmentId: z.string().trim().nullable(),
  bandKey: z.string().trim().max(40).nullable(),
  triggerTagId: z.string().trim().nullable(),
});

export const stepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["MESSAGE", "DELAY", "TAG"]),
  channel: z.enum(["EMAIL", "WABA"]).nullable(),
  subject: z.string().max(200),
  body: z.string().max(20000),
  wabaTemplate: z.string().trim().max(200),
  wabaLang: z.string().trim().max(10),
  wabaVars: z.array(z.string().max(500)).max(10),
  // A delay of zero is allowed and means "immediately after the previous step", which
  // is a legitimate thing to want and reads more clearly than deleting the step.
  delayAmount: z.number().int().min(0).max(999).nullable(),
  delayUnit: z.enum(["MINUTES", "HOURS", "DAYS", "MONTHS"]).nullable(),
  tagId: z.string().trim().nullable(),
  tagAction: z.enum(["ADD", "REMOVE"]).nullable(),
});

/**
 * Is this workflow fit to publish?
 *
 * Checked in the UI and again in the action. Publishing is the moment a draft starts
 * messaging real people, so "it looked fine on screen" is not the standard - the
 * server decides, and these are the reasons it would say no.
 */
export function publishProblems(w: {
  trigger: WorkflowTrigger;
  bandKey: string | null;
  triggerTagId: string | null;
  steps: WorkflowStepView[];
}): string[] {
  const out: string[] = [];
  if (w.steps.length === 0) out.push("It has no steps yet.");
  if (w.trigger === "BAND_REACHED" && !w.bandKey) out.push("Pick which band starts it.");
  if (w.trigger === "TAG_ADDED" && !w.triggerTagId) out.push("Pick which tag starts it.");
  if (!w.steps.some((s) => s.kind === "MESSAGE")) {
    out.push("It never sends anything. Add at least one message.");
  }
  for (const s of w.steps) {
    const n = s.displayOrder + 1;
    if (s.kind === "MESSAGE" && s.channel === "EMAIL" && !s.subject.trim()) {
      out.push(`Step ${n} has no subject line.`);
    }
    if (s.kind === "MESSAGE" && s.channel === "EMAIL" && !s.body.trim()) {
      out.push(`Step ${n} has no message.`);
    }
    if (s.kind === "MESSAGE" && s.channel === "WABA" && !s.wabaTemplate.trim()) {
      out.push(`Step ${n} has no approved template named.`);
    }
    if (s.kind === "DELAY" && (s.delayAmount == null || s.delayUnit == null)) {
      out.push(`Step ${n} is a wait with no length.`);
    }
    if (s.kind === "TAG" && (!s.tagId || !s.tagAction)) {
      out.push(`Step ${n} is a tag change with nothing chosen.`);
    }
  }
  return out;
}

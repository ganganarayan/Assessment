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

/**
 * Who a trigger is about.
 *
 * 🔴 THE FILTER THIS DRIVES IS NOT COSMETIC. A TENANT trigger fires about a workspace
 * - it published something, its trial started - and the workflow enrols that
 * workspace. Shown to a tenant, "subscription activated" reads as THEIR customer
 * subscribing to something. They would build a sequence on it and it would never fire,
 * with nothing anywhere to say why.
 */
export type TriggerAudience = "LEAD" | "TENANT";

export interface TriggerSpec {
  value: WorkflowTrigger;
  label: string;
  /** What it fires on, in the owner's words. Shown under the choice. */
  hint: string;
  /** LEAD unless stated: about a respondent rather than about a workspace. */
  audience?: TriggerAudience;
  /**
   * 🟡 False while the enum value exists but nothing emits it yet. Such a trigger is
   * HIDDEN rather than shown greyed out: a workflow somebody can select, publish and
   * watch do nothing is worse than a trigger they never saw. Flip it in the same
   * change that adds the emit, never before.
   */
  live?: boolean;
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
  {
    value: "APPOINTMENT_BOOKED",
    label: "They book a call",
    hint: "The moment a slot is taken. Confirm now, then nudge before the day.",
  },
  {
    value: "APPOINTMENT_RESCHEDULED",
    label: "They move the call",
    hint: "The booking kept its place in the diary but changed its time.",
  },
  {
    value: "APPOINTMENT_CANCELLED",
    label: "The call is cancelled",
    hint: "By them or by you. The slot went back on the calendar.",
  },
  {
    value: "APPOINTMENT_ATTENDED",
    label: "They turn up",
    hint: "Marked attended on the calendar. Where the follow-up sequence belongs.",
  },
  {
    value: "APPOINTMENT_NO_SHOW",
    label: "They do not turn up",
    hint: "Marked no-show. The one worth winning back rather than writing off.",
  },
  {
    value: "APPOINTMENT_TIME_PASSED",
    label: "The call's time passes, unmarked",
    hint: "The hour came and went and nobody said what happened. Use it to ask yourself.",
  },

  /* ----------------------------------------------- the rest of the funnel --- */

  {
    value: "ASSESSMENT_COMPLETED_PAID",
    label: "They finish and pay",
    hint: "Paid funnels only. They unlocked the result, so they are a buyer, not a lead.",
  },
  {
    value: "ASSESSMENT_COMPLETED_UNPAID",
    label: "They finish and do not pay",
    hint: "Paid funnels only, half an hour after they finished. The nudge that recovers a sale.",
  },
  {
    value: "ASSESSMENT_ABANDONED",
    label: "They give up partway",
    hint: "They started answering and stopped. They are interested and something put them off.",
  },
  {
    value: "RESULT_GENERATED",
    label: "Their result is ready",
    hint: "The scoring finished. Earlier than them looking at it.",
  },
  {
    value: "RESULT_VIEWED",
    label: "They open their result",
    hint: "They actually read it, which is the strongest signal a funnel produces.",
  },
  {
    value: "RESULT_LINK_REQUESTED",
    label: "They ask for their result again",
    hint: "Somebody came back and asked to be sent their old result. They are still thinking about it.",
  },
  {
    value: "CTA_CLICKED",
    label: "They click the booking button",
    hint: "They clicked through from the result page. Intent, whether or not they then booked.",
  },

  /* ------------------------------------------------- the person, not the funnel --- */

  {
    value: "TAG_REMOVED",
    label: "A tag is removed",
    hint: "The other half of handing somebody between sequences.",
    needsTag: true,
  },
  {
    value: "CONTACT_UNSUBSCRIBED",
    label: "They unsubscribe",
    hint: "🔴 Nothing here may message them. Useful for tidying up: remove tags, tell a CRM.",
  },
  {
    value: "PAYMENT_RECEIVED",
    label: "They pay",
    hint: "Any payment from a respondent: an unlock, or something sold on a pay link.",
    live: false,
  },

  /* ------------------------------------------- about a workspace, not a lead --- */

  {
    value: "TENANT_ASSESSMENT_PUBLISHED",
    label: "A workspace publishes a funnel",
    hint: "Their first real step. The moment to push them toward testing it and running traffic.",
    audience: "TENANT",
  },
  {
    value: "TENANT_RESULT_PAGE_PUBLISHED",
    label: "A workspace publishes a result page",
    hint: "They have built the page respondents land on.",
    audience: "TENANT",
  },
  {
    value: "TENANT_TEMPLATE_IMPORTED",
    label: "A workspace imports a template",
    hint: "They took something off the shelf. The follow-up is getting it live.",
    audience: "TENANT",
  },
  {
    value: "TENANT_TRIAL_STARTED",
    label: "A trial starts",
    hint: "They signed up. Day zero of the sequence that decides whether they stay.",
    audience: "TENANT",
    live: false,
  },
  {
    value: "TENANT_TRIAL_EXPIRING",
    label: "A trial is about to end",
    hint: "The last chance to show them what they have not used yet.",
    audience: "TENANT",
    live: false,
  },
  {
    value: "TENANT_SUBSCRIPTION_ACTIVATED",
    label: "A workspace subscribes",
    hint: "They paid. Onboarding proper starts here.",
    audience: "TENANT",
    live: false,
  },
  {
    value: "TENANT_SUBSCRIPTION_CHARGED",
    label: "A subscription renews",
    hint: "The recurring charge went through.",
    audience: "TENANT",
    live: false,
  },
  {
    value: "TENANT_SUBSCRIPTION_HALTED",
    label: "A payment fails",
    hint: "The card stopped working. Reaching them quickly is what saves the account.",
    audience: "TENANT",
    live: false,
  },
  {
    value: "TENANT_SUBSCRIPTION_CANCELLED",
    label: "A workspace cancels",
    hint: "They asked to stop. What you send now is the only thing that might change it.",
    audience: "TENANT",
    live: false,
  },
];

/**
 * Triggers that start from an appointment rather than from a funnel.
 *
 * They carry no band and no tag, and scoping them to one assessment means the funnel
 * the BOOKING LINK belongs to, not one somebody filled in. Kept as a set so the
 * builder and the queue agree on which ones those are.
 */
/** A trigger is about a lead unless it says otherwise. */
export function triggerAudience(t: TriggerSpec): TriggerAudience {
  return t.audience ?? "LEAD";
}

/** A trigger is live unless it says otherwise. */
export function triggerIsLive(t: TriggerSpec): boolean {
  return t.live !== false;
}

/**
 * The triggers worth OFFERING in a given scope.
 *
 * Platform scope sees both audiences, because the owner runs sequences about leads
 * and about their own customers. A workspace sees lead triggers only.
 */
export function offerableTriggers(isPlatform: boolean): TriggerSpec[] {
  return TRIGGERS.filter(
    (t) => triggerIsLive(t) && (isPlatform || triggerAudience(t) === "LEAD"),
  );
}

export const APPOINTMENT_TRIGGERS = new Set<WorkflowTrigger>([
  "APPOINTMENT_BOOKED",
  "APPOINTMENT_RESCHEDULED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_ATTENDED",
  "APPOINTMENT_NO_SHOW",
  "APPOINTMENT_TIME_PASSED",
]);

export const TRIGGER_LABEL: Record<WorkflowTrigger, string> = Object.fromEntries(
  TRIGGERS.map((t) => [t.value, t.label]),
) as Record<WorkflowTrigger, string>;

export type WorkflowRunStatusValue = "PENDING" | "SENDING" | "DONE" | "FAILED" | "CANCELLED";

/**
 * What a run's state is called on a log anybody reads.
 *
 * 🔴 CANCELLED IS NOT A FAILURE and must not be coloured like one. A run is cancelled
 * when the product decided not to send - they unsubscribed, the workflow was switched
 * off, a step ended the sequence - and every one of those is the system working. Red
 * next to it sends somebody looking for a bug that is not there.
 */
export const RUN_STATUS_LABEL: Record<WorkflowRunStatusValue, string> = {
  PENDING: "In progress",
  SENDING: "Sending",
  DONE: "Finished",
  FAILED: "Failed",
  CANCELLED: "Stopped",
};

export const RUN_STATUS_CLASS: Record<WorkflowRunStatusValue, string> = {
  PENDING: "border-[var(--field-border)] text-[var(--muted-foreground)]",
  SENDING: "border-[var(--field-border)] text-[var(--foreground)]",
  DONE: "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
  FAILED: "border-red-500/60 text-red-600 dark:text-red-400",
  CANCELLED: "border-amber-500/60 text-amber-600 dark:text-amber-400",
};

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
  /** SUBFLOW: the sequence to hand them to. */
  targetWorkflowId: string | null;
  /** WEBHOOK: which registered endpoint to post to. */
  webhookId: string | null;
  /** ZOOM_MEETING: what the meeting is called in Zoom. Placeholders allowed. */
  zoomTopic: string | null;
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

/**
 * The step kinds the builder OFFERS, in the order they are worth reaching for.
 *
 * 🔴 Not every WorkflowStepKind. BRANCH and LOOP wait for a canvas that can draw
 * them; ZOOM_MEETING waits for a workflow that has an appointment to put the link on,
 * which a sequence about a contact does not. Listed here so the picker, the zod
 * schema and the verify gate cannot disagree about what exists.
 */
export const OFFERED_STEP_KINDS = [
  "MESSAGE",
  "DELAY",
  "TAG",
  "SUBFLOW",
  "WEBHOOK",
  "NOTIFY_OWNER",
  "UNSUBSCRIBE",
  "ZOOM_MEETING",
  "EXIT",
] as const;

export type OfferedStepKind = (typeof OFFERED_STEP_KINDS)[number];

/**
 * The + menu.
 *
 * 🔴 ENTRIES, NOT KINDS, and the two are deliberately not the same list. Email and
 * WhatsApp are both a MESSAGE step; what separates them is the channel, and asking
 * somebody to add a "Message" and then discover a channel dropdown inside it is a
 * step nobody finds. The menu says the two things people actually want, and the
 * entry carries the channel the step starts with.
 */
export interface StepMenuEntry {
  id: string;
  label: string;
  kind: OfferedStepKind;
  channel?: WorkflowChannel;
  /** Offered only where Zoom is connected. */
  needsZoom?: boolean;
}

export const STEP_MENU: StepMenuEntry[] = [
  { id: "email", label: "Email", kind: "MESSAGE", channel: "EMAIL" },
  { id: "whatsapp", label: "WhatsApp", kind: "MESSAGE", channel: "WABA" },
  { id: "delay", label: "Wait", kind: "DELAY" },
  { id: "tag", label: "Tag", kind: "TAG" },
  { id: "subflow", label: "Call workflow", kind: "SUBFLOW" },
  { id: "webhook", label: "Call a webhook", kind: "WEBHOOK" },
  // 🔴 needsZoom, so it is HIDDEN unless this workspace has actually connected Zoom.
  // A step that cannot work is worse than one that is missing: it saves, publishes,
  // and then fails for every person who reaches it with nothing on screen to say why.
  { id: "zoom", label: "Get a Zoom link", kind: "ZOOM_MEETING", needsZoom: true },
  { id: "notify", label: "Notify me", kind: "NOTIFY_OWNER" },
  { id: "unsub", label: "Unsubscribe them", kind: "UNSUBSCRIBE" },
  { id: "exit", label: "End the sequence", kind: "EXIT" },
];
/** The menu entries this workspace can actually use. */
export function offerableSteps(zoomConnected: boolean): StepMenuEntry[] {
  return STEP_MENU.filter((m) => !m.needsZoom || zoomConnected);
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
  /** The OTHER published sequences this one can hand somebody to. Never itself. */
  workflows: { id: string; name: string }[];
  /** Registered endpoints. A step posts to one of these, never to a typed URL. */
  webhooks: { id: string; name: string }[];
  /** Whether this workspace has connected Zoom, which is what offers the Zoom step. */
  zoomConnected: boolean;
}

/* ------------------------------------------------------------- validation --- */

/**
 * Read off the registry rather than typed out again.
 *
 * 🟡 It was a second hand-written list, which is the quiet way a trigger gets added to
 * the menu and then refused on save: the UI offers it, the schema has never heard of
 * it, and the error says "Invalid enum value" to somebody who only picked a choice you
 * showed them. One list, so that cannot happen.
 */
const TRIGGER_VALUES = TRIGGERS.map((t) => t.value) as [WorkflowTrigger, ...WorkflowTrigger[]];

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80),
  trigger: z.enum(TRIGGER_VALUES),
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
  // 🔴 DERIVED FROM THE REGISTRY, NEVER LISTED AGAIN. This was a hand-written list of
  // three while the builder offered eight, so every new kind saved in the browser and
  // was refused by the server with a zod error nobody could act on. A second copy of a
  // list is a second copy that goes stale.
  kind: z.enum(OFFERED_STEP_KINDS),
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
  // Ids only, and only ever checked against the acting workspace on the server. A
  // plain id from a form is a request to touch a row, not permission to.
  targetWorkflowId: z.string().nullable().optional(),
  webhookId: z.string().nullable().optional(),
  zoomTopic: z.string().max(200).nullable().optional(),
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

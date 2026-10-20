/**
 * Shapes, labels and the placeholder vocabulary for automations. A PLAIN module: no
 * "use server", no DB, no secrets, so the builder UI can import it.
 *
 * The trigger registry lives here too, and it is the extension point: adding a trigger
 * is a row in TRIGGERS plus a mapping in lib/automation/enqueue.ts, not a new screen.
 */

export type AutomationTriggerValue =
  | "APPOINTMENT_BOOKED"
  | "APPOINTMENT_RESCHEDULED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_ATTENDED"
  | "APPOINTMENT_NO_SHOW"
  | "APPOINTMENT_REMINDER";

export type AutomationChannelValue = "EMAIL" | "WABA" | "ZOOM_MEETING";
export type AutomationRunStatusValue =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

export interface TriggerSpec {
  value: AutomationTriggerValue;
  label: string;
  /** What this fires on, in the owner's words. Shown under the choice. */
  hint: string;
  /** True for the one trigger that is due at a time rather than at an event. */
  timed: boolean;
}

/**
 * Every trigger, in the order a funnel meets them.
 *
 * 🟡 Appointment triggers only, on purpose. Opt-in and completion already have a sender
 * in Nurture, and offering them here as well would be two screens that both send one
 * email on opt-in while disagreeing about which. When they do move here, they arrive as
 * entries in this list.
 */
export const TRIGGERS: TriggerSpec[] = [
  {
    value: "APPOINTMENT_BOOKED",
    label: "A call is booked",
    hint: "The moment somebody takes a slot. The confirmation.",
    timed: false,
  },
  {
    value: "APPOINTMENT_REMINDER",
    label: "Before or after a call",
    hint: "A reminder, timed against the start of the call. The one that saves no-shows.",
    timed: true,
  },
  {
    value: "APPOINTMENT_RESCHEDULED",
    label: "A call is moved",
    hint: "The time changed. Tell them the new one.",
    timed: false,
  },
  {
    value: "APPOINTMENT_CANCELLED",
    label: "A call is cancelled",
    hint: "Called off by either side.",
    timed: false,
  },
  {
    value: "APPOINTMENT_ATTENDED",
    label: "They showed up",
    hint: "Marked after the call. The follow-up that lands while it is fresh.",
    timed: false,
  },
  {
    value: "APPOINTMENT_NO_SHOW",
    label: "They did not show up",
    hint: "Marked after the call. The one that offers them another slot.",
    timed: false,
  },
];

export const TRIGGER_LABEL: Record<AutomationTriggerValue, string> = Object.fromEntries(
  TRIGGERS.map((t) => [t.value, t.label]),
) as Record<AutomationTriggerValue, string>;

export const RUN_STATUS_LABEL: Record<AutomationRunStatusValue, string> = {
  PENDING: "Waiting",
  SENDING: "Sending",
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED: "Not sent",
  CANCELLED: "Called off",
};

export const RUN_STATUS_CLASS: Record<AutomationRunStatusValue, string> = {
  PENDING: "border-[var(--field-border)] text-[var(--muted-foreground)]",
  SENDING: "border-[var(--field-border)] text-[var(--foreground)]",
  SENT: "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
  FAILED: "border-red-500/60 text-red-600 dark:text-red-400",
  SKIPPED: "border-amber-500/60 text-amber-600 dark:text-amber-400",
  CANCELLED: "border-[var(--field-border)] text-[var(--muted-foreground)]",
};

/**
 * What a message can say about the appointment, beyond the lead's own fields.
 *
 * Two worth knowing about. {{manageUrl}} opens THEIR booking with a Move and a Cancel
 * on it, which is what turns a silent no-show into a freed slot - every reminder should
 * carry it. {{bookingUrl}} is the booking page with their own token on it, so booking
 * again opens a form already filled in with who they are.
 */
export const APPOINTMENT_PLACEHOLDERS = [
  "appointmentTime",
  "appointmentDate",
  "bookingName",
  "meetingLink",
  "bookingUrl",
  "icsUrl",
  "manageUrl",
  "unsubscribeUrl",
] as const;

/* -------------------------------------------------------------- view rows --- */

export interface AutomationActionRow {
  id: string;
  channel: AutomationChannelValue;
  subject: string;
  body: string;
  wabaTemplate: string;
  wabaLang: string;
  wabaVars: string[];
  /** ZOOM_MEETING: what the meeting is called in Zoom, with placeholders. */
  zoomTopic: string;
  /** What this ONE message has done. Lifetime counters that outlive the 30-day log,
   *  plus what it has done inside that window. */
  stats: {
    sent: number;
    failed: number;
    skipped: number;
    /** First clicks on a link in it. Always 0 for WhatsApp. */
    clicks: number;
    /** Sends inside the retained window, which is what "lately" means here. */
    recentSent: number;
    recentFailed: number;
  };
}

export interface AutomationRow {
  id: string;
  name: string;
  trigger: AutomationTriggerValue;
  bookingTypeId: string | null;
  bookingTypeName: string | null;
  offsetMin: number;
  active: boolean;
  actions: AutomationActionRow[];
  /** Sends that have gone out, so a rule that does nothing is visible as doing nothing. */
  sentCount: number;
  pendingCount: number;
  failedCount: number;
}

export interface AutomationRunRow {
  id: string;
  automationName: string;
  trigger: AutomationTriggerValue;
  /** Pre-formatted DD-MM-YYYY HH:MM IST. */
  dueLabel: string;
  status: AutomationRunStatusValue;
  attempts: number;
  lastError: string | null;
  skipReason: string | null;
  who: string;
  appointmentLabel: string;
}

/**
 * How a reminder's offset is said out loud. Negative is before the call, positive is
 * after it, and zero is as it starts.
 */
export function offsetLabel(offsetMin: number): string {
  if (offsetMin === 0) return "as the call starts";
  const before = offsetMin < 0;
  const mins = Math.abs(offsetMin);
  const unit =
    mins % 1440 === 0
      ? `${mins / 1440} day${mins / 1440 === 1 ? "" : "s"}`
      : mins % 60 === 0
        ? `${mins / 60} hour${mins / 60 === 1 ? "" : "s"}`
        : `${mins} minutes`;
  return `${unit} ${before ? "before" : "after"} the call`;
}

/** The offsets worth offering as a list; anything else is typed in minutes. */
export const OFFSET_PRESETS: { value: number; label: string }[] = [
  { value: -2880, label: "2 days before" },
  { value: -1440, label: "1 day before" },
  { value: -180, label: "3 hours before" },
  { value: -60, label: "1 hour before" },
  { value: -15, label: "15 minutes before" },
  { value: 60, label: "1 hour after" },
  { value: 1440, label: "1 day after" },
];

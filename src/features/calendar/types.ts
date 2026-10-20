/**
 * Shapes and labels shared by the calendar's server and client halves. A PLAIN module:
 * no "use server", no DB, no secrets, so a client component may import it.
 *
 * It exists for the rule a "use server" file cannot break - such a file may export
 * async functions only, and a type exported beside them typechecks locally and fails
 * the Railway build. Every type and constant the calendar UI needs lives here.
 */

export type AppointmentStatusValue = "BOOKED" | "CANCELLED" | "ATTENDED" | "NO_SHOW";
export type AppointmentSourceValue = "BOOKING" | "MANUAL";
export type BookingLocationKindValue = "MEET_LINK" | "PHONE" | "IN_PERSON";
export type AvailabilityExceptionKindValue = "BLOCK" | "OPEN";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Short form for the month grid header, where seven full names do not fit a phone. */
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const STATUS_LABEL: Record<AppointmentStatusValue, string> = {
  BOOKED: "Booked",
  CANCELLED: "Cancelled",
  ATTENDED: "Showed up",
  NO_SHOW: "No show",
};

/**
 * Badge classes per status. Green for a call that happened, amber for one that was
 * called off, red for the slot nobody turned up to, and plain for one still ahead:
 * an upcoming booking is not a result yet and colouring it would say it was.
 */
export const STATUS_CLASS: Record<AppointmentStatusValue, string> = {
  BOOKED: "border-[var(--field-border)] text-[var(--foreground)]",
  CANCELLED: "border-amber-500/60 text-amber-600 dark:text-amber-400",
  ATTENDED: "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
  NO_SHOW: "border-red-500/60 text-red-600 dark:text-red-400",
};

export const LOCATION_LABEL: Record<BookingLocationKindValue, string> = {
  MEET_LINK: "Online meeting link",
  PHONE: "Phone call",
  IN_PERSON: "In person",
};

/** What the public page tells a respondent to expect, per location kind. */
export const LOCATION_HINT: Record<BookingLocationKindValue, string> = {
  MEET_LINK: "You will get a meeting link",
  PHONE: "We will call you",
  IN_PERSON: "Address below",
};

/* -------------------------------------------------------------- view rows --- */

/** One appointment as every calendar surface draws it. Dates are ISO strings: this
 *  crosses the server/client boundary, where a Date does not survive. */
export interface AppointmentRow {
  id: string;
  startAt: string;
  endAt: string;
  /** Pre-formatted DD-MM-YYYY HH:MM IST, so no client has to format a date. */
  startLabel: string;
  /** IST calendar date, "YYYY-MM-DD" - what the month grid buckets on. */
  dateKey: string;
  /** IST HH:MM, for the day list. */
  timeLabel: string;
  status: AppointmentStatusValue;
  source: AppointmentSourceValue;
  title: string | null;
  notes: string | null;
  attendeeName: string | null;
  attendeeEmail: string | null;
  attendeeMobile: string | null;
  bookingTypeId: string | null;
  bookingTypeName: string | null;
  locationKind: BookingLocationKindValue | null;
  locationValue: string | null;
  submissionId: string | null;
  isPreview: boolean;
  /** Which appointment events have reached Meta, so the day list can say so rather
   *  than leaving the owner to wonder whether marking it did anything. */
  metaBooked: boolean;
  metaOutcome: boolean;
}

/** One booking type on the availability screen. */
export interface BookingTypeRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMin: number;
  bufferMin: number;
  noticeMin: number;
  horizonDays: number;
  slotStepMin: number;
  maxPerDay: number | null;
  locationKind: BookingLocationKindValue;
  locationValue: string | null;
  active: boolean;
  assessmentId: string | null;
  assessmentTitle: string | null;
  adAccountId: string | null;
  fireMetaCapi: boolean;
  metaBookedEvent: string;
  metaCancelledEvent: string;
  metaAttendedEvent: string;
  metaNoShowEvent: string;
  /** The public URL, built on the server from the request's own host so a tenant on a
   *  custom domain is shown their own link rather than the platform's. */
  publicUrl: string;
  rules: { id: string; weekday: number; startMin: number; endMin: number }[];
  exceptions: {
    id: string;
    dateKey: string;
    kind: AvailabilityExceptionKindValue;
    startMin: number | null;
    endMin: number | null;
    note: string | null;
  }[];
  /** Live bookings held against this type, so deleting one can warn first. */
  upcomingCount: number;
}

/** One selectable option in the booking type form (assessments, ad accounts). */
export interface PickerOption {
  id: string;
  label: string;
}

/** A date the public page can offer, with its open slots. */
export interface PublicDay {
  dateKey: string;
  /** "Mon 20 Oct" - built server-side in IST. */
  label: string;
  slots: { startMs: number; timeLabel: string }[];
}

/** What the public booking page needs to render. No ids a respondent cannot use. */
export interface PublicBookingView {
  slug: string;
  name: string;
  description: string | null;
  durationMin: number;
  locationKind: BookingLocationKindValue;
  locationValue: string | null;
  days: PublicDay[];
  /** Workspace name, shown so the respondent knows whose diary this is. */
  hostName: string;
}

/** The result of a successful booking, for the confirmation screen. */
export interface BookingConfirmation {
  appointmentId: string;
  startLabel: string;
  durationMin: number;
  locationKind: BookingLocationKindValue;
  locationValue: string | null;
  /** Download link for this one appointment, carrying its own capability token. */
  icsUrl: string;
}

import { z } from "zod";
import { hhmmToMinutes, isDateKey } from "@/lib/calendar/slots";

/**
 * Validation for everything the calendar accepts, from the owner and from the public.
 *
 * Times arrive from the UI as "HH:MM" (what a time input gives) and are stored as
 * minutes from IST midnight, so the conversion happens HERE, once, at the boundary.
 * Nothing downstream parses a clock string.
 */

const hhmm = z
  .string()
  .trim()
  .refine((v) => hhmmToMinutes(v) != null, "Use a time like 09:30.")
  .transform((v) => hhmmToMinutes(v) as number);

const dateKey = z
  .string()
  .trim()
  .refine(isDateKey, "Use a date like 2026-10-20.");

export const bookingTypeSlugSchema = z
  .string()
  .trim()
  .min(1, "Link name is required.")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "The link can use lowercase letters, numbers and hyphens.");

/**
 * A Meta event name. Letters and numbers only, which is what Meta accepts for a custom
 * event; a name with a space is accepted by the API and then never matches anything in
 * Events Manager, which is the worst of both outcomes.
 */
const metaEventName = z
  .string()
  .trim()
  .min(1, "An event name is required.")
  .max(40)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Use letters, numbers and underscores, starting with a letter.");

export const bookingTypeSchema = z.object({
  name: z.string().trim().min(1, "Give this call a name.").max(120),
  slug: bookingTypeSlugSchema,
  description: z.string().trim().max(2000).optional().default(""),
  durationMin: z.coerce.number().int().min(5, "A call is at least 5 minutes.").max(480),
  bufferMin: z.coerce.number().int().min(0).max(240),
  noticeMin: z.coerce.number().int().min(0).max(20160), // up to two weeks of notice
  horizonDays: z.coerce.number().int().min(1).max(365),
  slotStepMin: z.coerce.number().int().min(0).max(480),
  // Blank means no cap, which is why this is nullable rather than 0: a cap of zero
  // would be a booking type that can never be booked and reads like a mistake.
  maxPerDay: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(50)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  locationKind: z.enum(["MEET_LINK", "PHONE", "IN_PERSON"]),
  locationValue: z.string().trim().max(500).optional().default(""),
  active: z.boolean().default(true),
  assessmentId: z.string().trim().max(60).optional().default(""),
  adAccountId: z.string().trim().max(60).optional().default(""),
  /** Whose calendar this link sells time in, in SINGLE mode. Blank = the shared one. */
  assignedUserId: z.string().trim().max(60).optional().default(""),
  /** SINGLE sells one person's time; ROUND_ROBIN pools the members below. */
  assignmentMode: z.enum(["SINGLE", "ROUND_ROBIN"]).default("SINGLE"),
  /** The pool, for ROUND_ROBIN. Ignored in SINGLE mode. */
  memberIds: z.array(z.string().trim().min(1).max(60)).max(50).optional().default([]),
  fireMetaCapi: z.boolean().default(true),
  metaBookedEvent: metaEventName.default("Schedule"),
  metaCancelledEvent: metaEventName.default("AppointmentCancelled"),
  metaAttendedEvent: metaEventName.default("AppointmentAttended"),
  metaNoShowEvent: metaEventName.default("AppointmentNoShow"),
})
  // A team link with nobody in it offers no slots and takes no bookings, which from the
  // outside is indistinguishable from the product being broken. Refused at the save.
  .refine((v) => v.assignmentMode !== "ROUND_ROBIN" || (v.memberIds ?? []).length > 0, {
    message: "A team link needs at least one person in it.",
    path: ["memberIds"],
  });
export type BookingTypeInput = z.input<typeof bookingTypeSchema>;

export const availabilityRuleSchema = z
  .object({
    bookingTypeId: z.string().trim().min(1),
    weekday: z.coerce.number().int().min(0).max(6),
    start: hhmm,
    end: hhmm,
  })
  .refine((v) => v.end > v.start, {
    message: "The window has to end after it starts.",
    path: ["end"],
  });

export const availabilityExceptionSchema = z
  .object({
    bookingTypeId: z.string().trim().min(1),
    date: dateKey,
    kind: z.enum(["BLOCK", "OPEN"]),
    // Blank times mean the whole day, which is the common case for a holiday.
    start: z.union([z.literal(""), hhmm]).transform((v) => (v === "" ? null : v)),
    end: z.union([z.literal(""), hhmm]).transform((v) => (v === "" ? null : v)),
    note: z.string().trim().max(200).optional().default(""),
  })
  .refine((v) => v.start == null || v.end == null || v.end > v.start, {
    message: "The window has to end after it starts.",
    path: ["end"],
  })
  .refine((v) => (v.start == null) === (v.end == null), {
    message: "Give both times, or neither for the whole day.",
    path: ["end"],
  });

/**
 * An appointment the OWNER types in: a manual block, or a call booked over the phone.
 *
 * bookingTypeId is optional on purpose. With one, the row behaves as a booking of that
 * type and reports to Meta like any other; without one, it is time blocked out, which
 * occupies the slot and tells nobody anything.
 */
export const manualAppointmentSchema = z
  .object({
    bookingTypeId: z.string().trim().max(60).optional().default(""),
    date: dateKey,
    start: hhmm,
    /** Blank means "use the booking type's duration", or 30 minutes without one. */
    end: z.union([z.literal(""), hhmm]).transform((v) => (v === "" ? null : v)),
    title: z.string().trim().max(200).optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
    attendeeName: z.string().trim().max(200).optional().default(""),
    attendeeEmail: z
      .union([z.literal(""), z.string().trim().email("That email does not look right.")])
      .optional()
      .default(""),
    attendeeMobile: z.string().trim().max(30).optional().default(""),
    /** Whose calendar a BLOCK goes in. Ignored when a booking link is chosen: a
     *  booking belongs to the calendar its link sells. Blank = the shared calendar. */
    assignedUserId: z.string().trim().max(60).optional().default(""),
  })
  .refine((v) => v.end == null || v.end > v.start, {
    message: "The event has to end after it starts.",
    path: ["end"],
  });
export type ManualAppointmentInput = z.input<typeof manualAppointmentSchema>;

/**
 * What the PUBLIC booking page posts. Deliberately minimal and fully validated: this
 * is the one calendar surface an anonymous visitor can reach.
 *
 * startMs is an exact instant rather than a slot index, and the action re-derives the
 * slot list and refuses anything not in it. A slot id would be a number to guess at;
 * an instant that is not open simply fails.
 */
export const publicBookingSchema = z.object({
  slug: bookingTypeSlugSchema,
  startMs: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Your name is required.").max(200),
  email: z.string().trim().email("Enter a valid email address."),
  mobile: z.string().trim().max(30).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  /** The result token of the submission this booking came out of, when the respondent
   *  arrived from their result page. Checked against the submission, never trusted as
   *  identification on its own. */
  resultToken: z.string().trim().max(120).optional().default(""),
  /** The owner walking their own funnel. Keeps the booking real and the conversion
   *  out of Meta, matching how a preview run is treated everywhere else. */
  preview: z.boolean().optional().default(false),
});
export type PublicBookingInput = z.input<typeof publicBookingSchema>;

import { z } from "zod";

/** Validation for the automation builder. One rule, its trigger, and its actions. */

export const automationActionSchema = z
  .object({
    /**
     * The existing message this edit is to, when there is one. Blank for a new one.
     *
     * 🔴 It is here so that saving an automation UPDATES its messages instead of
     * replacing them. An action's id is the identity of that message, and every
     * statistic hangs off it - delete and recreate, and "sent 1,482 of these" resets to
     * zero the first time somebody fixes a typo in the subject line.
     */
    id: z.string().trim().max(60).optional().default(""),
    channel: z.enum(["EMAIL", "WABA"]),
    subject: z.string().trim().max(300).optional().default(""),
    body: z.string().trim().max(20000).optional().default(""),
    wabaTemplate: z.string().trim().max(200).optional().default(""),
    wabaLang: z.string().trim().max(20).optional().default("en"),
    wabaVars: z.array(z.string().trim().max(1000)).max(20).optional().default([]),
  })
  // Each channel has to carry what it actually needs to send. An email with no body and
  // a WhatsApp action with no template both save perfectly and then do nothing at the
  // moment they matter, which is hours later and invisible.
  .refine((v) => v.channel !== "EMAIL" || (v.subject !== "" && v.body !== ""), {
    message: "An email needs a subject and a body.",
    path: ["body"],
  })
  .refine((v) => v.channel !== "WABA" || v.wabaTemplate !== "", {
    message: "Pick the approved WhatsApp template to send.",
    path: ["wabaTemplate"],
  });

export const automationSchema = z
  .object({
    name: z.string().trim().min(1, "Give this automation a name.").max(120),
    trigger: z.enum([
      "APPOINTMENT_BOOKED",
      "APPOINTMENT_RESCHEDULED",
      "APPOINTMENT_CANCELLED",
      "APPOINTMENT_ATTENDED",
      "APPOINTMENT_NO_SHOW",
      "APPOINTMENT_REMINDER",
    ]),
    /** "" = every booking link in the workspace. */
    bookingTypeId: z.string().trim().max(60).optional().default(""),
    // Minutes against the call's start: negative before, positive after. Capped at a
    // week either way, because an offset longer than the booking horizon is a reminder
    // that can never come due and nothing would ever say so.
    offsetMin: z.coerce.number().int().min(-10080).max(10080).default(-1440),
    active: z.boolean().default(true),
    actions: z.array(automationActionSchema).min(1, "Add at least one message to send.").max(5),
  })
  .refine((v) => v.trigger !== "APPOINTMENT_REMINDER" || v.offsetMin !== 0, {
    message: "Pick when the reminder goes out.",
    path: ["offsetMin"],
  });

export type AutomationInput = z.input<typeof automationSchema>;

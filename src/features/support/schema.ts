import { z } from "zod";
import { SUPPORT_TOPICS } from "@/lib/support/model";

/**
 * What a support form is allowed to contain.
 *
 * The topic is checked against the FIXED list rather than accepted as text, because the
 * topic is the one field the owner scans the queue by: an arbitrary string there turns
 * the queue back into a list of subject lines.
 *
 * A plain module, so the client form and the server action validate against exactly the
 * same rules instead of two copies that drift.
 */

const kindSchema = z.enum(["SUPPORT", "ONBOARDING"]);

export const raiseSchema = z
  .object({
    kind: kindSchema,
    topic: z.string().trim().min(1, "Pick a topic."),
    subject: z
      .string()
      .trim()
      .min(4, "Give it a one-line summary.")
      .max(140, "Keep the summary to one line."),
    body: z
      .string()
      .trim()
      .min(20, "Tell us what happened, in a few sentences. What you expected and what you saw.")
      .max(5000, "That is longer than a support request needs to be. Attach a screenshot instead."),
  })
  .superRefine((v, ctx) => {
    if (!SUPPORT_TOPICS[v.kind].includes(v.topic)) {
      ctx.addIssue({ code: "custom", path: ["topic"], message: "Pick a topic from the list." });
    }
  });

export type RaiseInput = z.infer<typeof raiseSchema>;

export const messageSchema = z.object({
  requestId: z.string().min(1),
  body: z.string().trim().min(1, "Write something first.").max(8000, "That is too long to send in one message."),
});

export type MessageInput = z.infer<typeof messageSchema>;

/** The tenant's own WhatsApp number, as they type it. Digits are derived at send time. */
export const whatsappSchema = z.object({
  whatsapp: z
    .string()
    .trim()
    .max(32, "That is not a phone number.")
    .refine((v) => v === "" || /^[\d+\-()\s]{8,32}$/.test(v), "Digits, spaces and + only."),
});

import { z } from "zod";

/**
 * The done-for-you intake shape, in a PLAIN module.
 *
 * It does not live beside the server action because a "use server" file may export
 * nothing but async functions. A schema or a type exported from one compiles clean
 * locally and fails the Next build on Railway, which is the worst place to find out.
 *
 * Everything is free text rather than enums on purpose. These are the brief's ten
 * fields, and what someone types into "who is a bad lead for you" is the raw material
 * the gate gets written from - normalising it into options now would discard the only
 * part of this form that cannot be guessed from their website.
 */
export const dfySchema = z.object({
  business: z.string().trim().min(1, "Tell us the business name.").max(200),
  email: z.string().trim().email("That email does not look right.").max(200),
  whatsapp: z.string().trim().min(6, "We need a WhatsApp number to reach you on.").max(40),
  website: z.string().trim().max(300).optional().or(z.literal("")),
  sells: z.string().trim().min(1, "Tell us what you sell.").max(500),
  pricePoint: z.string().trim().min(1, "Tell us roughly what it costs.").max(200),
  trafficSource: z.string().trim().min(1, "Tell us where your traffic comes from.").max(200),
  monthlyLeads: z.string().trim().min(1, "Roughly how many leads a month?").max(200),
  /**
   * The one field the build actually depends on, so it carries a real minimum rather
   * than min(1): a one-word answer here produces a gate that screens nobody, and the
   * cheapest moment to ask for a sentence is before the form is submitted.
   */
  badLead: z.string().trim().min(15, "This one matters most - a sentence or two, please.").max(2000),
  calendarLink: z.string().trim().max(300).optional().or(z.literal("")),
  adAccountAccess: z.boolean(),
});

export type DfyInput = z.infer<typeof dfySchema>;

/** Empty form state, shared by the component's initial value and its reset. */
export const EMPTY_DFY: DfyInput = {
  business: "",
  email: "",
  whatsapp: "",
  website: "",
  sells: "",
  pricePoint: "",
  trafficSource: "",
  monthlyLeads: "",
  badLead: "",
  calendarLink: "",
  adAccountAccess: false,
};

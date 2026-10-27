import { z } from "zod";
import { MAX_BODY, MAX_FOOTER, MAX_HEADER, NAME_RE } from "@/features/wa-templates/types";

/**
 * What the server will accept for a template.
 *
 * Deliberately NOT the whole of Meta's ruleset. This is the boundary check: types,
 * lengths and the name's character set, the things a malformed request could carry.
 * The rules about variable numbering and examples live in templateIssues, because the
 * builder has to show all of them at once while the owner is still typing, and a zod
 * error only ever surfaces the first.
 */
export const waTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give it a name.")
    .max(60, "That name is too long.")
    .regex(NAME_RE, "The name can only use lowercase letters, numbers and underscores."),
  language: z.string().trim().min(2, "Pick a language.").max(10),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  headerText: z.string().max(MAX_HEADER, `The header is over ${MAX_HEADER} characters.`).default(""),
  bodyText: z
    .string()
    .trim()
    .min(1, "The body cannot be empty.")
    .max(MAX_BODY, `The body is over ${MAX_BODY} characters.`),
  footerText: z.string().max(MAX_FOOTER, `The footer is over ${MAX_FOOTER} characters.`).default(""),
  sampleValues: z.array(z.string().max(200)).max(20).default([]),
});

export type WaTemplateInput = z.infer<typeof waTemplateSchema>;

/**
 * WhatsApp template shapes, labels and Meta's own rules. A PLAIN module: no
 * "use server", no DB, no secrets, so the builder UI and the verify script can both
 * import it.
 *
 * 🔴 THE RULES BELOW ARE META'S, NOT OURS, and they are here rather than in the UI for
 * one reason: a template that breaks any of them is not rejected quickly. It is queued
 * for review, sits there, and comes back hours later with a reason like "Content is
 * invalid", which says nothing about which of the eight rules was broken. Checking them
 * before submission is the difference between a correction that costs a minute and one
 * that costs a day.
 */

export type WaTemplateStatusValue =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED";

export type WaTemplateCategoryValue = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export const STATUS_LABEL: Record<WaTemplateStatusValue, string> = {
  DRAFT: "Draft",
  PENDING: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAUSED: "Paused by Meta",
  DISABLED: "Disabled by Meta",
};

export const STATUS_CLASS: Record<WaTemplateStatusValue, string> = {
  DRAFT: "border-[var(--field-border)] text-[var(--muted-foreground)]",
  PENDING: "border-amber-500/60 text-amber-600 dark:text-amber-400",
  APPROVED: "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
  REJECTED: "border-red-500/60 text-red-600 dark:text-red-400",
  PAUSED: "border-amber-500/60 text-amber-600 dark:text-amber-400",
  DISABLED: "border-red-500/60 text-red-600 dark:text-red-400",
};

/**
 * The three categories, with the part Meta's own picker does not tell you: what each
 * one costs and what it is allowed to say.
 */
export const CATEGORIES: { value: WaTemplateCategoryValue; label: string; hint: string }[] = [
  {
    value: "UTILITY",
    label: "Utility",
    hint: "About something the person already did: a confirmation, a reminder, a receipt. Cheaper, and approved far more readily.",
  },
  {
    value: "MARKETING",
    label: "Marketing",
    hint: "An offer, an invitation, anything promotional. Dearer per message, and reviewed much more strictly.",
  },
  {
    value: "AUTHENTICATION",
    label: "Authentication",
    hint: "One-time passcodes only. Meta fixes the wording, so almost nothing here applies.",
  },
];

/**
 * How long after submitting a template its absence from Meta's list means nothing.
 *
 * Meta does not return a template from the list endpoint the instant it is accepted.
 * Inside this window "not there" is "not indexed yet"; outside it, it is "somebody
 * deleted it", and the two must not be reported the same way.
 */
export const NEW_TEMPLATE_GRACE_MS = 10 * 60_000;

/** Meta's limits, in characters. */
export const MAX_HEADER = 60;
export const MAX_BODY = 1024;
export const MAX_FOOTER = 60;

/** Lowercase letters, digits and underscores. Meta refuses anything else outright. */
export const NAME_RE = /^[a-z0-9_]+$/;

/** Turn whatever the owner typed into a name Meta will take. */
export function normaliseName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** The {{n}} numbers appearing in a body, in the order they appear, with repeats kept. */
export function variableNumbers(body: string): number[] {
  return [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
}

/** How many DISTINCT variables a body uses, which is how many samples Meta wants. */
export function variableCount(body: string): number {
  return new Set(variableNumbers(body)).size;
}

export interface TemplateDraft {
  name: string;
  language: string;
  category: WaTemplateCategoryValue;
  headerText: string;
  bodyText: string;
  footerText: string;
  sampleValues: string[];
}

/**
 * Every reason Meta would turn this down, in the owner's words.
 *
 * Returns a list rather than the first problem: a template with three faults should be
 * fixed in one pass, not three submissions a day apart.
 */
export function templateIssues(d: TemplateDraft): string[] {
  const out: string[] = [];
  const name = d.name.trim();
  const body = d.bodyText.trim();

  if (!name) out.push("Give it a name.");
  else if (!NAME_RE.test(name)) {
    out.push("The name can only use lowercase letters, numbers and underscores.");
  }
  if (!d.language.trim()) out.push("Pick a language.");
  if (!body) out.push("The body cannot be empty.");
  if (body.length > MAX_BODY) out.push(`The body is over ${MAX_BODY} characters.`);
  if (d.headerText.length > MAX_HEADER) out.push(`The header is over ${MAX_HEADER} characters.`);
  if (d.footerText.length > MAX_FOOTER) out.push(`The footer is over ${MAX_FOOTER} characters.`);

  const nums = variableNumbers(body);
  const distinct = [...new Set(nums)].sort((a, b) => a - b);

  // Meta numbers variables from 1 with no gaps. {{1}} and {{3}} is rejected, and the
  // reason it gives does not mention the missing {{2}}.
  for (let i = 0; i < distinct.length; i++) {
    if (distinct[i] !== i + 1) {
      out.push("Variables must be numbered {{1}}, {{2}}, {{3}} with no gaps.");
      break;
    }
  }
  if (nums.some((n) => n < 1)) out.push("Variables start at {{1}}, not {{0}}.");

  // Two of Meta's less obvious refusals. Both are about a message that could arrive
  // looking like nothing but substituted values.
  if (/^\s*\{\{\s*\d+\s*\}\}/.test(body)) out.push("The body cannot start with a variable. Put some words first.");
  if (/\{\{\s*\d+\s*\}\}\s*$/.test(body)) out.push("The body cannot end with a variable. Put some words after it.");
  if (/\}\}\s*\{\{/.test(body)) out.push("Two variables cannot sit next to each other. Put some words between them.");

  if (d.sampleValues.length < distinct.length || d.sampleValues.slice(0, distinct.length).some((v) => !v.trim())) {
    out.push("Every variable needs an example value. Meta rejects a template without them.");
  }

  return out;
}

/* -------------------------------------------------------------- view rows --- */

export interface WaTemplateRow {
  id: string;
  name: string;
  language: string;
  category: WaTemplateCategoryValue;
  headerText: string;
  bodyText: string;
  footerText: string;
  sampleValues: string[];
  status: WaTemplateStatusValue;
  metaId: string | null;
  metaStatus: string | null;
  rejectedReason: string | null;
  /** Pre-formatted DD-MM-YYYY HH:MM IST, or null. Formatted on the server, because a
   *  date formatted in the browser is formatted in the browser's locale. */
  submittedLabel: string | null;
  syncedLabel: string | null;
  /** True once Meta has it, which is what makes the name and language unchangeable. */
  submitted: boolean;
}

/** What the body will look like with the samples in it. */
export function previewWith(body: string, samples: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n: string) => {
    const v = samples[Number(n) - 1];
    return v && v.trim() ? v : whole;
  });
}

import { type SupportKind, type SupportStatus } from "@prisma/client";

/**
 * The vocabulary of the support feature: the two kinds, their fixed topics, the three
 * handling modes, and how a request is referred to in writing.
 *
 * A PLAIN module, imported by server actions, pages and client components alike. The
 * action files may export async functions only (a "use server" file that exports a
 * constant fails the Railway build while typechecking clean), so every shared value
 * lives here.
 */

/** The two queues, as the URLs and the menu see them. */
export const SUPPORT_KINDS = ["SUPPORT", "ONBOARDING"] as const;

/**
 * Fixed topics, per kind.
 *
 * Fixed and not tenant-authored, by decision. The topic is what tells the owner at a
 * glance which of these is a funnel that has stopped collecting leads and which is a
 * question about a button, and a free-text subject line already exists for everything
 * the list does not cover. An editable list screen is a later change that costs
 * nothing to make, because the validator reads this module in one place.
 */
export const SUPPORT_TOPICS: Readonly<Record<SupportKind, readonly string[]>> = {
  SUPPORT: [
    "My funnel is not collecting leads",
    "Conversions are not reaching Meta",
    "A question or option is scoring wrongly",
    "The result page or PDF looks wrong",
    "Custom domain or certificate",
    "Email or WhatsApp is not sending",
    "Webhook or CRM delivery",
    "Billing or plan",
    "Logins and access",
    "Something else",
  ],
  ONBOARDING: [
    "Set my first scorecard up with me",
    "Write or tighten my qualification gate",
    "Connect my Meta pixel and Conversions API",
    "Build my exclusion and retargeting audiences",
    "Point my custom domain at it",
    "Import a template and tailor it to my business",
    "Review my funnel before I spend on ads",
    "Something else",
  ],
};

/** What each queue is called on screen. */
export const KIND_LABEL: Readonly<Record<SupportKind, string>> = {
  SUPPORT: "Tickets",
  ONBOARDING: "Onboarding support",
};

/** Singular, for a sentence about one request. */
export const KIND_NOUN: Readonly<Record<SupportKind, string>> = {
  SUPPORT: "ticket",
  ONBOARDING: "onboarding request",
};

/**
 * The human reference. AS-1042 for a ticket, OB-1042 for an onboarding request.
 *
 * One sequence feeds both, so the prefix is what distinguishes them and the number
 * alone is never ambiguous about which thread it names.
 */
export function supportRef(kind: SupportKind, number: number): string {
  return `${kind === "ONBOARDING" ? "OB" : "AS"}-${number}`;
}

/**
 * How a queue is handled.
 *
 * IN_APP  raised here, badged on the owner's rail, answered in the thread, and the
 *         tenant is told by email and WhatsApp.
 * EMAIL   raised here, forwarded to the support inbox, and the conversation genuinely
 *         MOVES to email. No badge and no WhatsApp, because the WhatsApp template says
 *         "log in and read it" and that would be a lie.
 * OFF     the raise form is withdrawn. Open threads stay readable on both sides.
 */
export const SUPPORT_MODES = ["IN_APP", "EMAIL", "OFF"] as const;
export type SupportMode = (typeof SUPPORT_MODES)[number];

export function isSupportMode(value: string): value is SupportMode {
  return (SUPPORT_MODES as readonly string[]).includes(value);
}

/** The statuses that mean somebody on the platform side still owes an answer. */
export const PENDING_STATUSES: readonly SupportStatus[] = ["OPEN", "AWAITING_US"];

/** Whether a thread is finished, for the "closed" half of a list. */
export function isClosedStatus(status: SupportStatus): boolean {
  return status === "RESOLVED" || status === "CLOSED" || status === "FORWARDED";
}

export const STATUS_LABEL: Readonly<Record<SupportStatus, string>> = {
  OPEN: "Open",
  AWAITING_US: "Waiting on us",
  AWAITING_TENANT: "Replied",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  FORWARDED: "Moved to email",
};

/** What a tenant should read, which is not always what the owner reads. */
export const TENANT_STATUS_LABEL: Readonly<Record<SupportStatus, string>> = {
  OPEN: "Open",
  AWAITING_US: "With support",
  AWAITING_TENANT: "Answered",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  FORWARDED: "Answered by email",
};

/**
 * Upload limits for screenshots. Three is what the form offers.
 *
 * 🔴 The TOTAL matters more than the per-file size. Server actions in this app accept an
 * 8mb body (set for the builder, which saves whole assessments), and three 5mb images
 * would exceed it: the submit fails at the transport, before any code of ours runs, so
 * the customer gets a dead button and no explanation. The numbers below leave headroom
 * for the text fields and the framework's own overhead.
 */
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 6 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"] as const;

import { z } from "zod";
import type { BroadcastChannel, BroadcastStatus } from "@prisma/client";

/** Shapes and validation for the broadcast screens. A PLAIN module. */

export const STATUS_LABEL: Record<BroadcastStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  SENDING: "Sending",
  SENT: "Sent",
  CANCELLED: "Stopped",
  FAILED: "Failed",
};

export const STATUS_CLASS: Record<BroadcastStatus, string> = {
  DRAFT: "border-[var(--field-border)] text-[var(--muted-foreground)]",
  SCHEDULED: "border-sky-500/60 text-sky-600 dark:text-sky-400",
  SENDING: "border-amber-500/60 text-amber-600 dark:text-amber-400",
  SENT: "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
  CANCELLED: "border-[var(--field-border)] text-[var(--muted-foreground)]",
  FAILED: "border-red-500/60 text-red-600 dark:text-red-400",
};

export const BROADCAST_PLACEHOLDERS = [
  "firstName",
  "lastName",
  "name",
  "email",
  "mobile",
  "profession",
  "unsubscribeUrl",
] as const;

export interface AudienceView {
  assessmentIds: string[];
  tagIds: string[];
  bands: string[];
  createdFrom: string | null;
  createdTo: string | null;
  /** Reach the people who came off a connected phone and never opted in. */
  includeImported: boolean;
}

export interface BroadcastView {
  id: string;
  name: string;
  channel: BroadcastChannel;
  status: BroadcastStatus;
  subject: string;
  body: string;
  wabaTemplate: string;
  wabaLang: string;
  wabaVars: string[];
  audience: AudienceView;
  /** ISO, for the datetime input. Null on a draft. */
  scheduledAt: string | null;
  ratePerMinute: number;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  /** Formatted DD-MM-YYYY HH:MM IST, or null. */
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BroadcastListRow {
  id: string;
  name: string;
  channel: BroadcastChannel;
  status: BroadcastStatus;
  totalCount: number;
  sentCount: number;
  /** DD-MM-YYYY HH:MM IST. */
  scheduledAt: string | null;
  createdAt: string;
}

export interface BroadcastOptions {
  assessments: { id: string; title: string }[];
  tags: { id: string; name: string }[];
  wabaTemplates: { name: string; varCount: number }[];
  wabaAvailable: boolean;
}

export const audienceSchema = z.object({
  assessmentIds: z.array(z.string()).max(50),
  tagIds: z.array(z.string()).max(50),
  bands: z.array(z.string().max(40)).max(20),
  createdFrom: z.string().nullable(),
  createdTo: z.string().nullable(),
  // Defaulted to false rather than required, so an audience saved before this existed
  // keeps excluding the people who never opted in. The safe reading of silence.
  includeImported: z.boolean().default(false),
});

export const createBroadcastSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80),
  channel: z.enum(["EMAIL", "WABA"]),
});

export const saveBroadcastSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Give it a name.").max(80),
  subject: z.string().max(200),
  body: z.string().max(20000),
  wabaTemplate: z.string().trim().max(200),
  wabaLang: z.string().trim().max(10),
  wabaVars: z.array(z.string().max(500)).max(10),
  audience: audienceSchema,
  // A rate below one would stall the broadcast forever, and the upper bound is a
  // guard rail rather than a limit Meta enforces: anybody who needs more than 600 a
  // minute is doing something this screen should not make easy.
  ratePerMinute: z.number().int().min(1).max(600),
});

export const scheduleSchema = z.object({
  id: z.string().min(1),
  /** ISO instant. The UI sends what the datetime input produced, in the browser's zone. */
  scheduledAt: z.string().min(1, "Pick when it should go."),
});

/**
 * Why this broadcast cannot be scheduled yet.
 *
 * Checked on screen and again in the action. Scheduling is the moment this becomes a
 * real send to real people, so "it looked complete" is not the standard.
 */
export function scheduleProblems(b: {
  channel: BroadcastChannel;
  subject: string;
  body: string;
  wabaTemplate: string;
}): string[] {
  const out: string[] = [];
  if (b.channel === "EMAIL") {
    if (!b.subject.trim()) out.push("It has no subject line.");
    if (!b.body.trim()) out.push("It has no message.");
  } else if (!b.wabaTemplate.trim()) {
    out.push("No approved template is named.");
  }
  return out;
}

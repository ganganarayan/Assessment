import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { istDateRangeToUtc } from "@/lib/date";
import { statsFloorFor, floorCreatedAt } from "@/lib/stats-floor";
import { whereScope } from "@/lib/tenant/scope";
import { ToolError, type ToolContext } from "@/mcp/core/types";

/** A YYYY-MM-DD date, read as an IST day like every date filter in the app. */
export const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("YYYY-MM-DD, an IST day");

export const idInput = z.string().trim().min(1).max(64);

/** The workspace's where-fragment. Every MCP query spreads this; nothing reads unscoped. */
export function tenantWhere(ctx: ToolContext): { tenantId?: string | null } {
  return whereScope(ctx.workspace.scope);
}

/** An assessment of THIS workspace, or a plain not-found. A foreign id finds nothing. */
export async function assessmentInWorkspace(ctx: ToolContext, assessmentId: string) {
  const a = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...tenantWhere(ctx) },
    select: { id: true, title: true, slug: true, status: true, statsResetAt: true },
  });
  if (!a) throw new ToolError("No assessment with that id in this workspace. Call list_assessments.");
  return a;
}

/**
 * The reporting window the Stats and Submissions screens use: the picked range, floored at
 * the funnel's own reporting start (or the workspace's when no funnel is picked).
 */
export async function reportingWindow(
  ctx: ToolContext,
  range: { from?: string; to?: string },
  assessment: { statsResetAt: Date | null } | null,
): Promise<{ createdAt?: { gte?: Date; lte?: Date }; floor: Date | null; gte: Date | null; lte: Date | null }> {
  const { gte, lte } = istDateRangeToUtc(range.from, range.to);
  const floor = assessment ? assessment.statsResetAt : await statsFloorFor(ctx.workspace.scope);
  const w = floorCreatedAt(floor, gte, lte) as { createdAt?: { gte?: Date; lte?: Date } };
  return { ...w, floor, gte, lte };
}

export const AD_PARAMS = ["utm_content", "utm_term", "utm_campaign", "utm_source", "utm_medium"] as const;
export type AdParam = (typeof AD_PARAMS)[number];

/** The flat column PageView and GateDisqualification keep each utm parameter in. */
export const AD_COLUMN: Record<AdParam, "utmContent" | "utmTerm" | "utmCampaign" | "utmSource" | "utmMedium"> = {
  utm_content: "utmContent",
  utm_term: "utmTerm",
  utm_campaign: "utmCampaign",
  utm_source: "utmSource",
  utm_medium: "utmMedium",
};

export const adParamInput = z
  .enum(AD_PARAMS)
  .default("utm_content")
  .describe("Which URL parameter carries the Meta ad id. Default utm_content, i.e. ads with utm_content={{ad.id}}.");

/** Read one attribution key out of a stored attribution JSON blob. */
export function attributionValue(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function fullName(first: string | null, last: string | null): string | null {
  const n = [first, last].filter((p) => p && p.trim()).join(" ").trim();
  return n || null;
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import type { ResultSnapshot } from "@/lib/result/snapshot";

/**
 * INTERNAL, auth-gated person history. Never public.
 *   GET /api/admin/people/history?assessmentId=<id>&q=<email-or-phone>
 *
 * Returns EVERY completed submission for one person on one assessment, oldest →
 * newest, so corporate engagements can see progress over time. Grouping is by the
 * stored identifierValue (normalized email or mobile). The public /api/r endpoint
 * shows only the newest reading; this is the full history behind it.
 *
 * Auth: super admin (any assessment) or a tenant user whose tenant owns the
 * assessment. Platform-owned assessments (no tenant) are super-admin only.
 */
export const dynamic = "force-dynamic";

/** Both normalization styles, so the caller need not know the assessment's key
 *  kind: email (lowercased/trimmed) and mobile (digits-only). */
function candidateKeys(raw: string): string[] {
  const keys = new Set<string>();
  const email = raw.trim().toLowerCase();
  if (email) keys.add(email);
  const digits = raw.replace(/\D+/g, "");
  if (digits) keys.add(digits);
  return [...keys];
}

interface HistoryEntry {
  submissionId: string;
  completedAt: string | null;
  band: string | null;
  level: string | null;
  scorePercent: number | null;
  scoreRaw: number | null;
  max: number | null;
  categories: { name: string; score: number; max: number; band: string | null }[];
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const assessmentId = url.searchParams.get("assessmentId")?.trim() || "";
  const q = (url.searchParams.get("q") || url.searchParams.get("email") || url.searchParams.get("mobile") || "").trim();
  if (!assessmentId || !q) {
    return NextResponse.json({ error: "assessmentId and q (email or phone) are required" }, { status: 400 });
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, title: true, tenantId: true },
  });
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  // Authorization: super admin sees all; otherwise the caller's tenant must own it.
  const authorized = isSuperAdmin(user) || (!!assessment.tenantId && user.tenantId === assessment.tenantId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const keys = candidateKeys(q);
  if (keys.length === 0) return NextResponse.json({ error: "q is empty" }, { status: 400 });

  const rows = await prisma.submission.findMany({
    where: { assessmentId, identifierValue: { in: keys }, status: "COMPLETED" },
    orderBy: { completedAt: "asc" }, // oldest -> newest
    select: {
      id: true,
      completedAt: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      totalScore: true,
      maxScore: true,
      resultSnapshot: true,
    },
  });

  const submissions: HistoryEntry[] = rows.map((r) => {
    const snap = (r.resultSnapshot ?? null) as ResultSnapshot | null;
    return {
      submissionId: r.id,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      band: snap?.resultBand ?? null,
      level: snap?.resultBandLevel ?? null,
      scorePercent: snap?.scorePercent ?? null,
      scoreRaw: snap?.scoreRaw ?? r.totalScore ?? null,
      max: snap?.max ?? r.maxScore ?? null,
      categories: (snap?.categories ?? []).map((c) => ({
        name: c.name,
        score: c.score,
        max: c.max,
        band: c.band ?? null,
      })),
    };
  });

  // Person header from the newest row (last, since oldest→newest).
  const newest = rows[rows.length - 1];
  const person = newest
    ? {
        name: [newest.leadFirstName, newest.leadLastName].filter(Boolean).join(" ") || null,
        email: newest.leadEmail ?? null,
        mobile: newest.leadMobile ?? null,
      }
    : { name: null, email: null, mobile: null };

  return NextResponse.json(
    { assessment: { id: assessment.id, title: assessment.title }, person, count: submissions.length, submissions },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Pure builder for the Gita Mentor read (no DB / no env) so it is unit testable.
 * Shapes a COMPLETED submission + its result snapshot into the mentor payload.
 * Domain: assessment RESULTS (psychographic) — deliberately separate from the
 * meta_match marketing fields; a gita_mentor key never sees marketing PII.
 */
import { type ResultSnapshot, type CategoryResultEntry } from "@/lib/result/snapshot";

export function normalizeEmail(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s.length ? s : null;
}

/** The subset of a Submission the mentor read consumes. */
export interface MentorRecord {
  leadEmail: string | null;
  leadFirstName: string | null;
  leadLastName: string | null;
  leadProfession: string | null;
  completedAt: Date | null;
  resultSnapshot: unknown; // ResultSnapshot JSON (denormalized at completion)
  assessmentSlug: string | null;
  assessmentTitle: string | null;
}

export interface MentorCategory {
  name: string;
  band: string | null;
  score: number;
  max: number;
  meaning: string | null;
}

export interface MentorResponse {
  found: boolean;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  profession: string | null;
  assessment: { slug: string | null; title: string | null } | null;
  completed_at: string | null;
  overall: {
    band: string | null;
    level: string | null;
    score: number | null;
    max: number | null;
    percentage: number | null;
    suggestion: string | null;
  } | null;
  ai_statement: string | null;
  categories: MentorCategory[];
}

/** Not-found = the mentor should ask the person to take the assessment first. */
export const MENTOR_NOT_FOUND: MentorResponse = {
  found: false,
  email: null,
  first_name: null,
  last_name: null,
  profession: null,
  assessment: null,
  completed_at: null,
  overall: null,
  ai_statement: null,
  categories: [],
};

export function buildMentorResponse(rec: MentorRecord | null): MentorResponse {
  if (!rec) return { ...MENTOR_NOT_FOUND };
  const snap = (rec.resultSnapshot && typeof rec.resultSnapshot === "object"
    ? rec.resultSnapshot
    : null) as ResultSnapshot | null;
  // No scored snapshot => treat as not-found (mentor prompts to take the assessment).
  if (!snap) return { ...MENTOR_NOT_FOUND };

  const cats: CategoryResultEntry[] = Array.isArray(snap.categories) ? snap.categories : [];
  return {
    found: true,
    email: rec.leadEmail ?? null,
    first_name: rec.leadFirstName ?? null,
    last_name: rec.leadLastName ?? null,
    profession: rec.leadProfession ?? null,
    assessment: { slug: rec.assessmentSlug ?? null, title: rec.assessmentTitle ?? null },
    completed_at: rec.completedAt ? rec.completedAt.toISOString() : null,
    overall: {
      band: snap.resultBand ?? null,
      level: snap.resultBandLevel ?? null,
      score: snap.scoreRaw ?? null,
      max: snap.max ?? null,
      percentage: snap.scorePercent ?? null,
      suggestion: snap.resultSuggestion ?? null,
    },
    ai_statement: snap.aiStatement ?? null,
    categories: cats.map((c) => ({
      name: c.name,
      band: c.band ?? null,
      score: c.score,
      max: c.max,
      meaning: c.meaning ?? null,
    })),
  };
}

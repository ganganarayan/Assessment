"use server";

import { prisma } from "@/lib/db/prisma";
import { qualificationSchema } from "@/features/assessment/schemas";

/**
 * The gate's verdict on one respondent, decided on the SERVER.
 *
 * WHY THIS IS A ROUND TRIP. The bands compare a total against thresholds, and both the
 * points and the thresholds are the owner's instrument - a respondent who can read them
 * can answer to them, and the one question worth asking a founder is the one they
 * cannot game. So the browser sends which options were picked (it already knows those,
 * it rendered them) and gets back a verdict with no arithmetic attached.
 *
 * Hard exits are NOT decided here. An answer that ends the visit does so the instant it
 * is clicked, from the exitKey already in the payload, because making somebody wait on
 * a network call to be told they are not a fit is its own small insult. This call is
 * only for the band, and only once, after the last question.
 *
 * Fail-soft: anything unexpected returns "pass". A gate that cannot reach its own
 * database must not strand a qualified founder on a dead screen - the band is a triage
 * aid, and losing one to an outage costs more than letting one through unflagged.
 */
export interface GateVerdict {
  outcome: "pass" | "review" | "exit";
  /** Set when outcome is "exit": which route to show. */
  exitKey?: string;
}

export async function evaluateGate(slug: string, choices: Record<string, string>): Promise<GateVerdict> {
  try {
    const a = await prisma.assessment.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { qualification: true },
    });
    if (!a) return { outcome: "pass" };

    const parsed = qualificationSchema.safeParse(a.qualification);
    if (!parsed.success || !parsed.data.enabled) return { outcome: "pass" };
    const q = parsed.data;

    // An answer that disqualifies outranks any total. Re-checked here rather than
    // trusted from the client: this is the same resolution the browser did, done again
    // against the stored gate, so a tampered payload cannot buy its way past an exit.
    for (const question of q.questions) {
      if (question.type !== "choice") continue;
      const picked = question.options.find((o) => o.id === choices[question.id]);
      if (picked?.disqualifies) return { outcome: "exit", exitKey: picked.exitKey ?? "" };
    }

    if (!q.bands.enabled) return { outcome: "pass" };

    let score = 0;
    for (const question of q.questions) {
      if (question.type !== "choice") continue;
      const picked = question.options.find((o) => o.id === choices[question.id]);
      if (picked) score += picked.points;
    }

    if (score >= q.bands.passMin) return { outcome: "pass" };
    if (score >= q.bands.reviewMin) return { outcome: "review" };
    return { outcome: "exit", exitKey: q.bands.belowExitKey ?? "" };
  } catch {
    return { outcome: "pass" };
  }
}

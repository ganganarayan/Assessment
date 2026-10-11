"use server";

import { prisma } from "@/lib/db/prisma";
import { qualificationSchema } from "@/features/assessment/schemas";
import { gateVerdict, type GateVerdict } from "@/features/assessment/gate-verdict";

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
export type { GateVerdict };

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

    // The decision itself is in gate-verdict.ts: a disqualifying answer outranks any
    // total, then the bands. Re-run here against the STORED gate rather than trusted
    // from the client, so a tampered payload cannot buy its way past an exit.
    return gateVerdict(q, choices);
  } catch {
    return { outcome: "pass" };
  }
}

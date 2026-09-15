/**
 * Types for the cross-assessment viewer lookup. Kept in a plain module (NOT the
 * "use server" action file, which may export only async functions) so both the
 * server action and the client component can import them.
 */

/** A submission resolved by a pasted result token or customer id — the trace target
 *  for a VidaPulse viewer, found regardless of assessment or date window. */
export interface LookupHit {
  submissionId: string;
  assessmentId: string;
  slug: string;
  assessmentTitle: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  profession: string | null;
  customerId: string | null;
  resultToken: string | null;
  status: string;
  createdAt: string; // ISO
  completedAt: string | null; // ISO or null
}

export type LookupResult =
  | { ok: true; hit: LookupHit | null }
  | { ok: false; error: string };

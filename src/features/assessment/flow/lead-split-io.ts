/**
 * What the SPLIT capture actions hand back.
 *
 * A plain module rather than the action file: a "use server" file may export only
 * async functions at runtime, and keeping the shapes here means the runner can import
 * them without importing the server action itself.
 */

/** The email screen's answer. `locked` carries the same fields the opt-in's lockout
 *  does, so the runner renders the one lockout screen for both modes. */
export type SplitLeadResult =
  | { status: "captured"; customerId: string; leadToken: string }
  | {
      status: "locked";
      policy: "DELAYED" | "NEVER";
      lastCompletedAt: string | null;
      nextAvailableAt: string | null; // null = never (NEVER policy)
      /** A previous result exists AND can be emailed (token + address on file). */
      resultAvailable: boolean;
    };

/** What the phone screen presents to prove it owns the lead row it is completing. */
export interface SplitLeadHandle {
  customerId: string;
  leadToken: string;
}

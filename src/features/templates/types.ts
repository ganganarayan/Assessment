/**
 * Shapes the Template Library's actions return.
 *
 * They live here and not in the action files because a "use server" module may export
 * async functions ONLY. A type exported from one typechecks clean and then fails the
 * Railway build, which is a slow way to find out.
 */

/** What the owner needs to know at the moment they approve a contribution. */
export interface ContributionRewardView {
  contributorTenantId: string | null;
  contributorName: string | null;
  /** Workspace name, for the sentence the console shows. */
  tenantName: string | null;
  /** Accepted contributions from this workspace THIS calendar month, including this
   *  one. Over 1 means the cap was exceeded and the owner chose to override it. */
  acceptedThisMonth: number;
  /** Their credit period right now (ISO), so the reward control can extend from it. */
  planExpiresAt: string | null;
  /** The plan the grant mechanism would carry forward. */
  plan: string | null;
}

export interface SaveAsTemplateResult {
  templateId: string;
  /** True when it went to the master library and is awaiting review. */
  pending: boolean;
}

export interface ReseedResult {
  created: number;
  updated: number;
  /** Rows skipped because they were edited in the app (seedLocked). Reported rather
   *  than hidden: "nothing changed" and "I deliberately left yours alone" look
   *  identical in a count, and only one of them is what the owner meant. */
  kept: number;
  failed: Array<{ slug: string; error: string }>;
}

/** What the Template editor loads: the document as text, plus what the row is. */
export interface TemplateDocumentView {
  id: string;
  slug: string;
  /** The template document, pretty-printed - what the editor shows and parses back. */
  json: string;
  builtin: boolean;
  /** Edited here, so the repo file no longer overwrites it. */
  seedLocked: boolean;
}

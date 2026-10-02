import type { Topic } from "@/lib/seo/types";

/**
 * Topic clusters. One cluster, one owning pillar — the rule that keeps two of our own
 * pages from bidding for the same query.
 *
 * Clusters are added as their pillar is written, never before. A cluster whose pillar
 * does not exist yet would put knowledge-base answers on the site with nothing to link
 * up to, which is how an orphan page happens.
 */
export const TOPICS: ReadonlyArray<Topic> = [
  {
    id: "lead-qualification",
    title: "Lead qualification",
    pillarSlug: "lead-qualification-software",
    blurb:
      "Deciding which enquiries are worth a sales conversation — and filtering the rest out before anyone spends time on them.",
  },
];

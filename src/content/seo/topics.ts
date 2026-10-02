import type { Topic } from "@/lib/seo/types";

/**
 * Topic clusters. One cluster, one owning pillar — the rule that keeps two of our own
 * pages from bidding for the same query.
 *
 * The split between a pillar and its answers is by QUERY SHAPE, not by subject: the pillar
 * owns the noun ("lead scoring software"), its answers own the question forms ("how does
 * lead scoring work"). Both are about the same thing, and that is the point — they are the
 * same topic answered at two different moments of intent, so they support each other
 * instead of competing. verify-seo fails the build if a term is claimed twice.
 */
export const TOPICS: ReadonlyArray<Topic> = [
  {
    id: "lead-qualification",
    title: "Lead qualification",
    pillarSlug: "lead-qualification-software",
    blurb:
      "Deciding which enquiries are worth a sales conversation — and filtering the rest out before anyone spends time on them.",
  },
  {
    id: "assessment-software",
    title: "Assessment software",
    pillarSlug: "assessment-software",
    blurb:
      "Building the assessment itself: the questions, how long it should be, and what the respondent gets back for answering.",
  },
  {
    id: "lead-scoring",
    title: "Lead scoring",
    pillarSlug: "lead-scoring",
    blurb:
      "Turning answers into a number that means something — points, category weights, and the threshold that defines qualified.",
  },
  {
    id: "scorecards",
    title: "Scorecards",
    pillarSlug: "scorecard",
    blurb:
      "The hosted scorecard and its result page: what a respondent sees, and why that view is what makes them answer honestly.",
  },
  {
    id: "quiz-funnels",
    title: "Quiz funnels",
    pillarSlug: "lead-qualification-quiz",
    blurb:
      "Quizzes as an acquisition channel, and the difference between one that grows a list and one that qualifies a pipeline.",
  },
  {
    id: "pre-call-qualification",
    title: "Qualifying before the call",
    pillarSlug: "qualify-leads-before-sales-call",
    blurb:
      "Moving the questions a rep would ask in the first five minutes to before the call is ever booked.",
  },
];

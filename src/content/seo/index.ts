import { TOPICS } from "./topics";
import { answer as whatIsLeadQualificationSoftware } from "./answers/what-is-lead-qualification-software";
import { answer as formVsScorecard } from "./answers/what-is-the-difference-between-a-form-and-a-scorecard";
import { answer as qualifyBeforeCall } from "./answers/how-do-i-qualify-leads-before-a-sales-call";
import { answer as unqualifiedAdLeads } from "./answers/why-do-my-ads-produce-unqualified-leads";
import { page as leadQualificationSoftware } from "./pages/lead-qualification-software";

/**
 * Every piece of public content, enumerated by hand.
 *
 * Explicit imports rather than a directory glob: the bundler can only tree-shake and
 * type-check what it can see statically, and a file that is never imported should fail
 * the content audit loudly rather than quietly not ship.
 */
export { TOPICS };

export const ANSWER_SOURCES = [
  whatIsLeadQualificationSoftware,
  formVsScorecard,
  qualifyBeforeCall,
  unqualifiedAdLeads,
];

export const PAGE_SOURCES = [leadQualificationSoftware];

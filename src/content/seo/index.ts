import { TOPICS } from "./topics";

import { answer as whatIsLeadQualificationSoftware } from "./answers/what-is-lead-qualification-software";
import { answer as formVsScorecard } from "./answers/what-is-the-difference-between-a-form-and-a-scorecard";
import { answer as unqualifiedAdLeads } from "./answers/why-do-my-ads-produce-unqualified-leads";

import { answer as whatIsAnOnlineAssessment } from "./answers/what-is-an-online-assessment";
import { answer as howLongShouldAnAssessmentBe } from "./answers/how-long-should-an-assessment-be";
import { answer as canAiWriteQuestions } from "./answers/can-ai-write-my-assessment-questions";

import { answer as howDoesLeadScoringWork } from "./answers/how-does-lead-scoring-work";
import { answer as goodLeadScoreThreshold } from "./answers/what-is-a-good-lead-score-threshold";

import { answer as whatIsAnOnlineScorecard } from "./answers/what-is-an-online-scorecard";
import { answer as scorecardResultPage } from "./answers/what-should-a-scorecard-result-page-show";

import { answer as whatIsAQuizFunnel } from "./answers/what-is-a-quiz-funnel";
import { answer as doQuizFunnelsStillWork } from "./answers/do-quiz-funnels-still-work";

import { answer as qualifyBeforeCall } from "./answers/how-do-i-qualify-leads-before-a-sales-call";
import { answer as questionsToQualify } from "./answers/what-questions-should-i-ask-to-qualify-a-lead";
import { answer as unqualifiedBooking } from "./answers/should-i-let-unqualified-leads-book-a-call";

import { page as leadQualificationSoftware } from "./pages/lead-qualification-software";
import { page as assessmentSoftware } from "./pages/assessment-software";
import { page as leadScoring } from "./pages/lead-scoring";
import { page as scorecard } from "./pages/scorecard";
import { page as leadQualificationQuiz } from "./pages/lead-qualification-quiz";
import { page as qualifyLeadsBeforeSalesCall } from "./pages/qualify-leads-before-sales-call";

/**
 * Every piece of public content, enumerated by hand.
 *
 * Explicit imports rather than a directory glob: the bundler can only tree-shake and
 * type-check what it can see statically, and a file that is never imported should fail
 * the content audit loudly rather than quietly not ship.
 */
export { TOPICS };

export const ANSWER_SOURCES = [
  // Lead qualification
  whatIsLeadQualificationSoftware,
  formVsScorecard,
  unqualifiedAdLeads,
  // Assessment software
  whatIsAnOnlineAssessment,
  howLongShouldAnAssessmentBe,
  canAiWriteQuestions,
  // Lead scoring
  howDoesLeadScoringWork,
  goodLeadScoreThreshold,
  // Scorecards
  whatIsAnOnlineScorecard,
  scorecardResultPage,
  // Quiz funnels
  whatIsAQuizFunnel,
  doQuizFunnelsStillWork,
  // Qualifying before the call
  qualifyBeforeCall,
  questionsToQualify,
  unqualifiedBooking,
];

export const PAGE_SOURCES = [
  leadQualificationSoftware,
  assessmentSoftware,
  leadScoring,
  scorecard,
  leadQualificationQuiz,
  qualifyLeadsBeforeSalesCall,
];

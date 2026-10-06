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

// Meta ads and lead quality - the cluster written from the pipeline this app runs.
import { answer as qualifiedOnlyEvent } from "./answers/what-is-a-qualified-only-conversion-event";
import { answer as excludeUnqualified } from "./answers/how-do-i-exclude-unqualified-leads-from-meta-ads";
import { answer as retargetQualified } from "./answers/can-i-retarget-only-the-leads-that-qualified";
import { answer as browserOrServer } from "./answers/should-lead-events-go-through-the-browser-or-the-server";
import { answer as costPerLeadUp } from "./answers/why-does-cost-per-lead-go-up-when-lead-quality-improves";

import { page as leadQualificationSoftware } from "./pages/lead-qualification-software";
import { page as assessmentSoftware } from "./pages/assessment-software";
import { page as leadScoring } from "./pages/lead-scoring";
import { page as scorecard } from "./pages/scorecard";
import { page as leadQualificationQuiz } from "./pages/lead-qualification-quiz";
import { page as qualifyLeadsBeforeSalesCall } from "./pages/qualify-leads-before-sales-call";
import { page as metaAdsLeadQualification } from "./pages/meta-ads-lead-qualification";

// Comparison pages (kind: comparison). Each names a real product and carries the
// date its facts were checked, because another company's product changes without
// telling us and an undated claim about it is a claim with no shelf life.
import { page as scoreAppAlt } from "./pages/scoreapp-alternative";
import { page as typeformAlt } from "./pages/typeform-alternative";
import { page as outgrowAlt } from "./pages/outgrow-alternative";
import { page as involveMeAlt } from "./pages/involve-me-alternative";
import { page as leadQuizzesAlt } from "./pages/leadquizzes-alternative";
import { page as interactAlt } from "./pages/interact-alternative";
import { page as jotformAlt } from "./pages/jotform-alternative";
import { page as googleFormsAlt } from "./pages/google-forms-alternative";
import { page as filloutAlt } from "./pages/fillout-alternative";
import { page as surveyMonkeyAlt } from "./pages/surveymonkey-alternative";
import { page as marquizAlt } from "./pages/marquiz-alternative";
import { page as riddleAlt } from "./pages/riddle-alternative";
import { page as paperformAlt } from "./pages/paperform-alternative";

// Industry pages (kind: use-case). One per vertical we actually sell into: the
// qualifying facts differ by trade, so these are twelve different pages rather than
// one page with the noun swapped.
import { page as agencies } from "./pages/lead-qualification-for-agencies";
import { page as coaches } from "./pages/lead-qualification-for-coaches";
import { page as consultants } from "./pages/lead-qualification-for-consultants";
import { page as saas } from "./pages/lead-qualification-for-saas";
import { page as realEstate } from "./pages/lead-qualification-for-real-estate";
import { page as clinics } from "./pages/lead-qualification-for-clinics";
import { page as financialAdvisors } from "./pages/lead-qualification-for-financial-advisors";
import { page as lawFirms } from "./pages/lead-qualification-for-law-firms";
import { page as itServices } from "./pages/lead-qualification-for-it-services";
import { page as homeServices } from "./pages/lead-qualification-for-home-services";
import { page as courseCreators } from "./pages/lead-qualification-for-course-creators";
import { page as insuranceBrokers } from "./pages/lead-qualification-for-insurance-brokers";

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
  // Meta ads
  qualifiedOnlyEvent,
  excludeUnqualified,
  retargetQualified,
  browserOrServer,
  costPerLeadUp,
];

export const PAGE_SOURCES = [
  leadQualificationSoftware,
  assessmentSoftware,
  leadScoring,
  scorecard,
  leadQualificationQuiz,
  qualifyLeadsBeforeSalesCall,
  metaAdsLeadQualification,
  // Industry pages
  agencies,
  coaches,
  consultants,
  saas,
  realEstate,
  clinics,
  financialAdvisors,
  lawFirms,
  itServices,
  homeServices,
  courseCreators,
  insuranceBrokers,
  // Comparison pages
  scoreAppAlt,
  typeformAlt,
  outgrowAlt,
  involveMeAlt,
  leadQuizzesAlt,
  interactAlt,
  jotformAlt,
  googleFormsAlt,
  filloutAlt,
  surveyMonkeyAlt,
  marquizAlt,
  riddleAlt,
  paperformAlt,
];

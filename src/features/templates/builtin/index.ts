/**
 * The built-in templates, as JSON files in the repo.
 *
 * Imported statically rather than read off disk. A runtime `fs.readdir` of a folder
 * next to the source works on a laptop and then depends on the deployed image keeping
 * the same layout; a static import is resolved at build time and cannot be wrong at
 * runtime. The cost is this one list to keep up to date, which a missing file turns
 * into a build error rather than a silently shorter library.
 *
 * Typed `unknown` on purpose: zod validates every document in seed.ts, so the file is
 * checked by the same rules a contributed template is, and tsc does not have to infer
 * a 900-line literal type for each one.
 */
import coachClientFit from "./coach-client-fit.json";
import healerReadiness from "./healer-readiness.json";
import astrologerConsultFit from "./astrologer-consult-fit.json";
import saasPilotFit from "./saas-pilot-fit.json";
import agencyRetainerFit from "./agency-retainer-fit.json";
import consultantEngagementFit from "./consultant-engagement-fit.json";
import clinicTreatmentFit from "./clinic-treatment-fit.json";
import realEstateBuyerFit from "./real-estate-buyer-fit.json";
// Templates 9 to 20, the second wave. Same shape, same rules, one vertical each.
import studyAbroadEligibility from "./study-abroad-eligibility.json";
import interiorDesignProjectFit from "./interior-design-project-fit.json";
import franchiseApplicantFit from "./franchise-applicant-fit.json";
import solarRooftopFit from "./solar-rooftop-fit.json";
import adviserSuitabilityFit from "./adviser-suitability-fit.json";
import legalIntakeTriage from "./legal-intake-triage.json";
import itProjectFit from "./it-project-fit.json";
import homeServicesJobFit from "./home-services-job-fit.json";
import cohortReadiness from "./cohort-readiness.json";
import insuranceEligibilityFit from "./insurance-eligibility-fit.json";
import webinarAttendeeFit from "./webinar-attendee-fit.json";
import candidateRoleFit from "./candidate-role-fit.json";

export const BUILTIN_TEMPLATE_DOCS: unknown[] = [
  coachClientFit,
  healerReadiness,
  astrologerConsultFit,
  saasPilotFit,
  agencyRetainerFit,
  consultantEngagementFit,
  clinicTreatmentFit,
  realEstateBuyerFit,
  studyAbroadEligibility,
  interiorDesignProjectFit,
  franchiseApplicantFit,
  solarRooftopFit,
  adviserSuitabilityFit,
  legalIntakeTriage,
  itProjectFit,
  homeServicesJobFit,
  cohortReadiness,
  insuranceEligibilityFit,
  webinarAttendeeFit,
  candidateRoleFit,
];

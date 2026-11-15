import "server-only";

/**
 * The "ad ready" setup sequence: the one order every Claude session follows to take a
 * new customer from an empty workspace to a tested, published funnel and one URL for
 * their ads. Served two ways from this one text, so the two can never disagree:
 * a short pointer in the server instructions, and the full steps as the MCP prompt
 * named ad_ready_setup.
 *
 * Ads are never launched from here. "Ad ready" ends at the URL.
 */

/** What Meta's "URL parameters" field should hold. utm_content carries the ad id, which is
 *  what get_funnel_stats reads per ad by default (ad_param = utm_content). */
export const META_URL_PARAMETERS =
  "utm_source={{site_source_name}}&utm_medium={{placement}}&utm_campaign={{campaign.name}}&utm_term={{adset.id}}&utm_content={{ad.id}}";

export const AD_READY_PROMPT_NAME = "ad_ready_setup";

export const AD_READY_INSTRUCTION =
  `When connection_status shows a workspace with zero assessments, or the person asks for qualified leads, run the ad-ready setup (the ${AD_READY_PROMPT_NAME} prompt holds the steps) instead of reporting stats. ` +
  "Never ask the owner to test on the live link: test runs go through the test link only.";

const STEPS = [
  "You are setting up an Assess360 funnel that ends with one URL the owner pastes into their ads. Ads are never launched from here.",
  "",
  "Rules for the whole session:",
  "- Every write previews first. Show the person, in plain words, what will change, wait for a clear yes, then confirm with the preview_token.",
  "- Explain each gate question and each of its options in plain words before saving it: which answers pass, which turn the person away, which waitlist them.",
  "- Write every question, option and screen in the owner's own words, about their own business.",
  "- Never ask the owner to test on the live link. Test only through the test link. A live-link test fires real Meta events and puts the owner in their own audiences.",
  "- If connection_status says the key is read only, stop and tell the person exactly what read_only_notice says.",
  "",
  "Step 0. Call connection_status. Confirm the key can write and which workspace you are in.",
  "",
  "Step 1. Collect everything up front, in one short conversation:",
  "- what they sell, and the price",
  "- who is a good lead (traits)",
  "- who wastes their time (traits)",
  "- what a qualified person should do next: book a call, pay, or start a trial, and the booking or payment link",
  "- their Meta pixel id, CAPI access token, and a test event code from Events Manager, Test events",
  "",
  "Step 2. Template. Call list_templates, pick the closest one, say why, and import it (templates.library.importTemplate, or onboarding.importStarterTemplate for a first funnel). Read it back with get_assessment.",
  "",
  "Step 3. Gate. Walk through every gate question and option with the owner. Rewrite them in their words. Save with assessment.qualification.saveQualification. Every disqualifying option must point at an exit: create exits with assessment.qualification.ensureGateExit, and a waitlist exit with ensureWaitlistExit if they want one.",
  "",
  "Step 4. Exits. Give every exit a heading and body text (assessment.qualification.saveDisqualifiedContent). A waitlist exit is a polite 'not yet', never a rejection.",
  "",
  "Step 5. Landing screen. Read it with assessment.landing.getLandingScreen and save headline, sub-line, intro and start button with assessment.landing.saveLandingScreen.",
  "",
  "Step 6. Assessment. Categories (assessment.category.*), questions with points per answer (assessment.question.*). Use describe_app_action before any action whose listing signature is cut.",
  "",
  "Step 7. Bands. Overall result bands must cover 0 to 100 with no gap or overlap (assessment.result-band.*). Add category bands where there are categories (assessment.category-band.*).",
  "",
  "Step 8. Result page. Create or bind one (result-pages.docs.*), fill its blocks (assessment.pages.*), publish it (assessment.pages.publishPages) and make sure it is bound to this assessment.",
  "",
  "Step 9. Pixel and CAPI. Save the ad account (admin.ad-account.createAdAccount), make sure this assessment reports to it, save the test event code on it (admin.ad-account.saveTestEventCode), then fire a test with events.capi-test.testMetaCapi using the test event code. Do not go on until Meta accepted it. With the code saved, test runs send their server events to Events Manager, Test events, and never to production.",
  "",
  "Step 10. Publish with assessment.assessment.setAssessmentStatus(id, true).",
  "",
  "Step 11. Owner test runs, through the test link only (test_link on get_assessment, or assessment.test-runs.getTestLink; it works on a phone without signing in): once turned away, once waitlisted (if configured), once passing the gate and abandoning, once completing. After each run, read back what fired with events.log.listRunEvents(assessmentId, 30, true): every run should show its path, the browser events as would_fire (the pixel is off in test runs) and the server events as test_sent. Explain each run to the owner in plain words.",
  "",
  "Before a fresh round of testing, assessment.test-runs.clearTestRuns removes earlier test runs. get_funnel_stats reports test runs apart from real numbers; real numbers must not move.",
  "",
  "Step 12. Check readiness: gate questions and exits, landing copy, bands 0 to 100, result page published and bound, ad account and accepted CAPI test, published, one test run per path. If anything fails, tell the owner exactly which and fix it.",
  "",
  `Step 13. Hand over the public URL and tell them to paste this into the Meta ad's URL parameters field, exactly: ${META_URL_PARAMETERS}`,
].join("\n");

export const AD_READY_PROMPT = {
  name: AD_READY_PROMPT_NAME,
  title: "Ad ready setup",
  description: "Take a new customer from an empty workspace to a tested, published funnel and one URL for their ads.",
  arguments: [] as { name: string; description: string; required: boolean }[],
  text: STEPS,
};

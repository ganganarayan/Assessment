import { z } from "zod";

/** Validation schemas for the Assessment Engine (admin CRUD + public flow). */

export const slugSchema = z
  .string()
  .min(1, "Slug is required.")
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase letters, numbers, and hyphens.",
  );

/** One field on the optional "pre-results" data-capture page. */
export const preResultFieldSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1, "Field label is required.").max(200),
  type: z.enum(["text", "select"]),
  // Dropdown options (for type "select"); trimmed + non-empty. Ignored for "text".
  options: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  required: z.boolean().default(false),
});
export type PreResultField = z.infer<typeof preResultFieldSchema>;

/** Audience gate (Phase 2). One role row in the first-screen dropdown. `target`
 *  is "" to continue in THIS assessment, else the id of the assessment to redirect
 *  to (existence + no-cycle enforced in the action, which has the DB). */
export const audienceRoleSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1, "Role label is required.").max(120),
  target: z.string().max(60).optional().or(z.literal("")).default(""),
});
export type AudienceRoleInput = z.infer<typeof audienceRoleSchema>;

/** How the first-screen audience question is answered:
 *  - DROPDOWN: pick one of the `roles` (supports per-choice cascade routing).
 *  - FREETEXT: type a value, with live suggestions from the tenant's canonical
 *    list; a non-matching value is still accepted. Free text can't route. */
export const AUDIENCE_MODES = ["DROPDOWN", "FREETEXT"] as const;
export const audienceModeSchema = z.enum(AUDIENCE_MODES).default("DROPDOWN");
export type AudienceMode = (typeof AUDIENCE_MODES)[number];

export const audienceGateSchema = z.object({
  // Which input the first screen shows. DROPDOWN keeps the existing role picker +
  // routing; FREETEXT shows a type-ahead text field (capture only, no routing).
  mode: audienceModeSchema,
  label: z.string().max(120).optional().or(z.literal("")).default(""),
  placeholder: z.string().max(120).optional().or(z.literal("")).default(""),
  // FREETEXT only: whether the respondent must fill the field to continue.
  freeTextRequired: z.boolean().default(false),
  // Which named audience list feeds this gate. "" = the tenant's default list, which
  // is what every gate saved before named lists existed resolves to - so adding this
  // changed nothing for a funnel already running. A list belonging to another tenant
  // never resolves (the resolver checks ownership), it falls back to the default.
  listId: z.string().max(60).optional().or(z.literal("")).default(""),
  // Every choice (including "None of the above", if wanted) is just a role row with
  // its own target. "" target = continue here; else an assessment id to redirect to.
  roles: z.array(audienceRoleSchema).max(30).default([]),
});
export type AudienceGateInput = z.infer<typeof audienceGateSchema>;
export const EMPTY_AUDIENCE_GATE: AudienceGateInput = {
  mode: "DROPDOWN",
  label: "",
  placeholder: "",
  freeTextRequired: false,
  listId: "",
  roles: [],
};

/* ---- Qualification gate (Page 1) --------------------------------------- */

/** One selectable answer on a qualification question; `disqualifies` routes the
 *  respondent to the disqualified page (no lead / submission / result created).
 *
 *  `points` lets a gate answer carry weight for the people who PASS, so the gate is not
 *  only a yes/no door: "has budget, barely" and "has budget, comfortably" can both
 *  qualify and still be worth different amounts. Defaults to 0, which is why adding this
 *  changes nothing for an existing funnel - a 0-point option contributes 0 to the score
 *  and 0 to the achievable maximum, so the percentage the result bands match on is
 *  untouched until an owner sets a number.
 *
 *  Negative values are allowed deliberately: a reservation worth recording is sometimes
 *  easier to express as a penalty than by re-weighting everything else. */
export const qualOptionSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1, "Option label is required.").max(200),
  disqualifies: z.boolean().default(false),
  points: z.number().int().min(-1000).max(1000).default(0),
  // CONDITIONAL DISQUALIFYING ROUTE. Which exit this answer sends them to, by the
  // exit's stable key. "" = the first exit, which is what every disqualifying answer
  // did before routes existed, so nothing that is live today changes.
  //
  // The KEY is stored, never the name: the owner renames an exit whenever they like,
  // and a name used as the identifier would re-route every question that pointed at it
  // the moment it was reworded. Only meaningful when `disqualifies` is true.
  exitKey: z.string().max(60).optional().or(z.literal("")).default(""),
});
export type QualOptionInput = z.infer<typeof qualOptionSchema>;

/** One Page-1 gating question (shown one at a time).
 *  - "choice": options with qualify/disqualify (auto-advance on pick).
 *  - "text": a free-text input for MANUAL review - never qualifies/disqualifies;
 *    the answer is stored on the submission (Custom details) for the owner to read. */
export const qualQuestionSchema = z
  .object({
    id: z.string().min(1).max(60),
    text: z.string().trim().min(1, "Question text is required.").max(400),
    type: z.enum(["choice", "text"]).default("choice"),
    placeholder: z.string().max(200).optional().or(z.literal("")).default(""),
    required: z.boolean().default(false),
    options: z.array(qualOptionSchema).max(20).default([]),
  })
  .refine((q) => q.type === "text" || q.options.length >= 2, {
    message: "A choice question needs at least two options.",
    path: ["options"],
  });
export type QualQuestionInput = z.infer<typeof qualQuestionSchema>;

/**
 * SCORE BANDS. What happens to somebody who answered every question without hitting a
 * hard exit, decided by the gate total rather than by any one answer.
 *
 * The problem it solves: a gate built only from hard exits throws away the founder who
 * is weak on one axis and strong on the others. With bands, a weak answer is survivable
 * - the total decides - and the band in the middle is a queue the owner reads rather
 * than a door that slams.
 *
 *   score >= passMin                 -> through, untagged
 *   reviewMin <= score < passMin     -> through, tagged REVIEW
 *   score < reviewMin                -> routed to `belowExitKey`
 *
 * `enabled` false (the default) means no band ever applies, which is every gate that
 * exists today: they pass everyone who dodged the hard exits, exactly as before.
 *
 * 🔴 Evaluated on the SERVER, never in the browser. The points live only in the
 * assessment row; the public payload carries labels and exit keys, never numbers, so a
 * respondent cannot read the thresholds out of the page and answer to them.
 */
export const gateBandsSchema = z.object({
  enabled: z.boolean().default(false),
  passMin: z.number().int().min(-10000).max(10000).default(0),
  reviewMin: z.number().int().min(-10000).max(10000).default(0),
  /** Exit for anyone under reviewMin. "" = the first exit. */
  belowExitKey: z.string().max(60).optional().or(z.literal("")).default(""),
});
export type GateBandsInput = z.infer<typeof gateBandsSchema>;
export const EMPTY_GATE_BANDS: GateBandsInput = { enabled: false, passMin: 0, reviewMin: 0, belowExitKey: "" };

/** What the bands decided for one respondent. Stored, never shown to them. */
export const GATE_BANDS = ["PASS", "REVIEW"] as const;
export type GateBand = (typeof GATE_BANDS)[number];

export const qualificationSchema = z.object({
  enabled: z.boolean().default(false),
  questions: z.array(qualQuestionSchema).max(20).default([]),
  bands: gateBandsSchema.default(EMPTY_GATE_BANDS),
  // Whether the respondent sees their gate answers and points on the result page.
  // TRUE is what the app has always done, and a gate-only funnel has nothing else to
  // show, so it stays the default. Turned off by a gate that scores people privately.
  showGateOnResult: z.boolean().default(true),
});
export type QualificationInput = z.infer<typeof qualificationSchema>;
export const EMPTY_QUALIFICATION: QualificationInput = {
  enabled: false,
  questions: [],
  bands: EMPTY_GATE_BANDS,
  showGateOnResult: true,
};

/** True when an assessment's qualification gate is actually live (enabled + has at
 *  least one question). Pure - safe on client and server. */
export function isQualificationActive(q: unknown): boolean {
  const p = qualificationSchema.safeParse(q);
  return p.success && p.data.enabled && p.data.questions.length > 0;
}

/** Completion event name. Gated funnels fire QualifiedCompletion (a fresh signal for
 *  Meta, kept separate from the legacy AssessmentCompleted); ungated funnels keep
 *  firing AssessmentCompleted exactly as before. Used by BOTH the browser pixel and
 *  the server CAPI so the two dedup on the same name. */
export const COMPLETION_EVENT_DEFAULT = "AssessmentCompleted";
export const COMPLETION_EVENT_GATED = "QualifiedCompletion";
export function completionEventName(gateActive: boolean): string {
  return gateActive ? COMPLETION_EVENT_GATED : COMPLETION_EVENT_DEFAULT;
}

/**
 * Meta event names used outside the completion path. Named here (not inline at
 * the call sites) because the ad account's audiences are built on these exact
 * strings - renaming one silently stops populating an audience, with no error
 * anywhere.
 *
 * GATE_DISQUALIFIED_EVENT - fired SERVER-side (Conversions API) when the page-1
 *   gate rejects someone, and by the owner's manual Disqualify button. No browser
 *   pixel: the rejection has no PII to match on, and CAPI needs none (IP, user
 *   agent, _fbp/_fbc and the first-party external_id are match keys), so firing
 *   from the server survives ad blockers and every send is counted.
 * ABANDONED_EVENT - fired by the sweep for a visitor who PASSED the gate and
 *   then never completed. Server-side only: a browser cannot reliably report
 *   its own departure, so this is decided later by the sweep, not by the page.
 */
export const GATE_DISQUALIFIED_EVENT = "GateDisqualified";
/** Passed the gate and was let through to the assessment. OFF unless an assessment
 *  asks for it (metaEvents.gatePassed === true), because every gated funnel on the
 *  install would otherwise start firing a new event on the next deploy - a change to
 *  live event volume nobody asked for.
 *
 *  🔴 RENAMED from "GatePassed" on 16-10-2026. Anyone the gate lets through IS
 *  qualified, and the name should carry that weight where it is read - in the ad
 *  account, next to QualifiedCompletion. Meta treats this as a NEW custom event:
 *  volume on the old name stops, any audience or campaign built on GatePassed must be
 *  re-pointed at GateQualified, and the new one starts accumulating from zero. The
 *  stored config key stays `gatePassed`, so no assessment's switch is disturbed. */
export const GATE_PASSED_EVENT = "GateQualified";
export const ABANDONED_EVENT = "AssessmentAbandoned";
/** Passed the gate but never reached the opt-in form. A different audience from
 *  ABANDONED_EVENT: these people never saw the ask, so there is nothing for them to
 *  have refused, and an ad that treats the two alike misreads both. */
export const GATE_INCOMPLETE_EVENT = "GateIncomplete";
/** A trial actually started. Fired once per workspace when it is first opened, and by
 *  the owner's button for a lead they judge to have really begun using it. The step
 *  above CompleteRegistration on one pixel: lead, trial, revenue. */
export const START_TRIAL_EVENT = "StartTrial";

/**
 * ONE EXIT ROUTE. A gate used to have a single disqualified page, so every rejection -
 * the employee, the practitioner, the founder who simply cannot make these dates - left
 * through the same door and arrived in the same Meta audience. They are not the same
 * person and they are not worth the same thing, which is the whole argument for this.
 *
 * `key` is generated once and never changes; `name` is the owner's word for it and is
 * editable at any time. An answer stores the key, so renaming "Waitlist" to "Next
 * cycle" reroutes nothing.
 *
 * MODE
 *   PAGE     - the exit page, as before. No lead, no submission, nothing stored.
 *   OPTIN    - not a rejection. Sent to the lead form, details captured, lead webhook
 *              fired, and the exit's content shown as the thank-you. They never answer
 *              the assessment.
 *   CONTINUE - the waitlist route, and the one that pays. They are QUALIFIED; what they
 *              failed was a date. So they take the whole assessment like anybody else
 *              and reach the same result page - throwing away a completed diagnosis on a
 *              qualified founder to keep the gate tidy is the expensive trade. What
 *              changes is the CLOSE (result-page blocks can be addressed to them alone)
 *              and what Meta is told, which must never be the main optimisation event.
 *
 * META
 *   `fireDisqualifiedEvent` and `eventName` stay PER EXIT. One event, one meaning: an
 *   exclusion audience built from waitlist sign-ups is a corrupted exclusion audience,
 *   and no amount of care further down the funnel repairs it.
 *   `contentCategory` rides along as custom_data.content_category, so two exits that
 *   SHOULD share an event (both are "get these people out of the ad set") can still be
 *   told apart in an audience rule without splitting thin volume across two event names.
 */
export const EXIT_MODES = ["PAGE", "OPTIN", "CONTINUE"] as const;
export const exitModeSchema = z.enum(EXIT_MODES).default("PAGE");
export type ExitMode = (typeof EXIT_MODES)[number];

export const gateExitSchema = z.object({
  key: z.string().min(1).max(60),
  name: z.string().trim().max(60).default(""),
  mode: exitModeSchema,
  heading: z.string().max(200).optional().or(z.literal("")).default(""),
  subtext: z.string().max(500).optional().or(z.literal("")).default(""),
  bodyHtml: z.string().max(10000).optional().or(z.literal("")).default(""),
  buttonLabel: z.string().max(80).optional().or(z.literal("")).default(""),
  buttonUrl: z.string().max(2000).optional().or(z.literal("")).default(""),
  fireDisqualifiedEvent: z.boolean().default(true),
  /** Blank = GateDisqualified. An exit that is not a rejection should say so here. */
  eventName: z.string().trim().max(60).optional().or(z.literal("")).default(""),
  /** custom_data.content_category on that event, e.g. "not_yet" / "wrong_fit". */
  contentCategory: z.string().trim().max(60).optional().or(z.literal("")).default(""),
  /**
   * CONTINUE only: what Meta is told when one of these people COMPLETES the assessment.
   * Blank = the funnel's normal completion event, which for a waitlist route is the
   * wrong answer: CompleteRegistration and AssessmentCompleted are what the ad account
   * optimises toward, and teaching it to find founders who cannot attend doubles the
   * cost of a filled seat without anything looking broken.
   */
  completionEventName: z.string().trim().max(60).optional().or(z.literal("")).default(""),
});
export type GateExitInput = z.infer<typeof gateExitSchema>;

/** Content of the exit page(s). The six legacy fields stay at the top level as EXIT
 *  ONE's content, written on every save, so a rollback or an in-flight cached payload
 *  still renders a real page instead of the default copy. They are derived - `exits` is
 *  the source of truth whenever it is present - and come out in a later release. */
export const disqualifiedContentSchema = z.object({
  heading: z.string().max(200).optional().or(z.literal("")).default(""),
  subtext: z.string().max(500).optional().or(z.literal("")).default(""),
  bodyHtml: z.string().max(10000).optional().or(z.literal("")).default(""),
  buttonLabel: z.string().max(80).optional().or(z.literal("")).default(""),
  buttonUrl: z.string().max(2000).optional().or(z.literal("")).default(""),
  fireDisqualifiedEvent: z.boolean().default(true),
  exits: z.array(gateExitSchema).max(20).default([]),
});
export type DisqualifiedContentInput = z.infer<typeof disqualifiedContentSchema>;
export const EMPTY_DISQUALIFIED: DisqualifiedContentInput = {
  heading: "",
  subtext: "",
  bodyHtml: "",
  buttonLabel: "",
  buttonUrl: "",
  fireDisqualifiedEvent: true,
  exits: [],
};

/** The name shown for an exit that has not been named yet. */
export const UNNAMED_EXIT = "Exit";

/**
 * The exits of an assessment, normalized.
 *
 * A gate saved before routes existed has no `exits` array at all: its single page
 * becomes exit one, carrying the content already there, so it keeps rendering what it
 * renders today and the owner never has to open the builder. Pure - safe on both sides.
 */
export function readExits(raw: unknown): GateExitInput[] {
  const parsed = disqualifiedContentSchema.safeParse(raw ?? {});
  const d = parsed.success ? parsed.data : EMPTY_DISQUALIFIED;
  if (d.exits.length > 0) return d.exits;
  return [
    {
      key: "exit1",
      name: "",
      mode: "PAGE",
      heading: d.heading,
      subtext: d.subtext,
      bodyHtml: d.bodyHtml,
      buttonLabel: d.buttonLabel,
      buttonUrl: d.buttonUrl,
      fireDisqualifiedEvent: d.fireDisqualifiedEvent,
      eventName: "",
      contentCategory: "",
      completionEventName: "",
    },
  ];
}

/** The exit an answer (or a band) routes to. An unknown or blank key lands on the
 *  first exit rather than on nothing: a dangling key is a builder mistake, and the
 *  respondent should still be shown a page. */
export function resolveExit(exits: ReadonlyArray<GateExitInput>, key: string | null | undefined): GateExitInput | null {
  if (exits.length === 0) return null;
  const k = (key ?? "").trim();
  if (k) {
    const found = exits.find((e) => e.key === k);
    if (found) return found;
  }
  return exits[0] ?? null;
}

/** True when this route sends the person on through the assessment rather than ending
 *  the visit. The waitlist case: qualified people, wrong dates. */
export function exitTakesAssessment(exit: GateExitInput | null | undefined): boolean {
  return exit?.mode === "CONTINUE";
}

/** True when this route asks for their details at all (either kind of opt-in). */
export function exitCapturesLead(exit: GateExitInput | null | undefined): boolean {
  return exit?.mode === "OPTIN" || exit?.mode === "CONTINUE";
}

/** What a named exit is called in a list, falling back to its position. */
export function exitLabel(exit: GateExitInput, index: number): string {
  return exit.name.trim() || `${UNNAMED_EXIT} ${index + 1}`;
}

/** The tenant's canonical audience list (AppSetting.audienceCanonical): the
 *  default roles that feed both the free-field suggestions and the normalize
 *  screen. Trimmed, de-duped and capped in the settings action. */
export const audienceCanonicalSchema = z.array(z.string().trim().min(1).max(120)).max(200).default([]);
export type AudienceCanonicalInput = z.infer<typeof audienceCanonicalSchema>;

/** A named audience list's name. Short, because it is read in a dropdown next to the
 *  funnel it feeds, not in a page of its own. */
export const audienceListNameSchema = z.string().trim().min(1, "Give the list a name.").max(60);

export const assessmentSchema = z.object({
  title: z.string().min(2, "Title is required.").max(160),
  slug: slugSchema,
  eyebrow: z.string().max(200).optional().or(z.literal("")),
  subheadline: z.string().max(500).optional().or(z.literal("")),
  // One sentence above the opt-in form - the offer a qualified respondent reads first.
  qualifiedNote: z.string().max(400).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  // Funnel CTA styling (hex like "#16a34a"); blank = default green/white theme.
  buttonColor: z.string().max(20).optional().or(z.literal("")),
  buttonTextColor: z.string().max(20).optional().or(z.literal("")),
  // Per-assessment heatmap/recording snippet (e.g. MS Clarity). Blank = fall back to
  // the tenant's Settings-level snippet. Generous cap for a pasted vendor <script>.
  heatmapCode: z.string().max(20000).optional().or(z.literal("")),
  // Optional pre-results data-capture page.
  preResultHeading: z.string().max(200).optional().or(z.literal("")),
  preResultSubtext: z.string().max(1000).optional().or(z.literal("")),
  preResultFields: z.array(preResultFieldSchema).max(30).default([]),
  coverImageUrl: z.string().url("Must be a valid URL.").optional().or(z.literal("")),
  estimatedMinutes: z.coerce.number().int().min(0).max(600).optional(),
  thankYouMessage: z.string().max(2000).optional().or(z.literal("")),
  // Lead-capture config.
  /** ALL_AT_ONCE = one opt-in screen, positioned by leadCaptureAfter (every funnel
   *  built so far). SPLIT = name, gate, email, assessment, phone. Both read the same
   *  collect/*Required/*Label fields below, so switching modes loses no configuration. */
  leadCaptureMode: z.enum(["ALL_AT_ONCE", "SPLIT"]).default("ALL_AT_ONCE"),
  collectFirstName: z.boolean().default(true),
  firstNameRequired: z.boolean().default(false),
  collectLastName: z.boolean().default(true),
  lastNameRequired: z.boolean().default(false),
  collectEmail: z.boolean().default(true),
  emailRequired: z.boolean().default(true),
  collectMobile: z.boolean().default(true),
  mobileRequired: z.boolean().default(false),
  collectProfession: z.boolean().default(true),
  professionRequired: z.boolean().default(true),
  // Custom profession dropdown options (trimmed, non-empty, deduped). Empty = the
  // built-in default list.
  professionOptions: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  // Editable lead-field LABELS (blank = the built-in default label).
  firstNameLabel: z.string().max(60).optional().or(z.literal("")),
  lastNameLabel: z.string().max(60).optional().or(z.literal("")),
  emailLabel: z.string().max(60).optional().or(z.literal("")),
  mobileLabel: z.string().max(60).optional().or(z.literal("")),
  professionLabel: z.string().max(60).optional().or(z.literal("")),
  professionPlaceholder: z.string().max(120).optional().or(z.literal("")),
  // Lead-capture position: false = opt-in first (default); true = after the questions.
  leadCaptureAfter: z.boolean().default(false),
  // Platform signup funnel. Accepted from the builder but only HONOURED on a
  // platform-owned assessment - the action forces it false otherwise, so a tenant
  // cannot turn their funnel into a signup path for the SaaS itself.
  platformSignup: z.boolean().default(false),
  // Extra custom fields on the opt-in form (same shape as pre-results fields).
  optinFields: z.array(preResultFieldSchema).max(30).default([]),
  // Editable opt-in copy. Blank = default behavior.
  introNotice: z.string().max(2000).optional().or(z.literal("")),
  startButtonLabel: z.string().max(120).optional().or(z.literal("")),
  resultsButtonLabel: z.string().max(120).optional().or(z.literal("")),
  // Retake lockout config.
  retakePolicy: z.enum(["DELAYED", "NEVER", "UNLIMITED"]).default("DELAYED"),
  // The lock period. Floor is ZERO here, not one, and the "at least 1" rule lives in
  // the refine below where it can see the policy.
  //
  // The field is only RENDERED when the policy is DELAYED, so a funnel that arrived
  // with 0 and a policy of NEVER or UNLIMITED - an import, say - failed validation on
  // every save, on every step, pointing at a field the form had no reason to show. The
  // owner was told to fix a number that was not on screen and did not matter.
  retakeDays: z.coerce
    .number()
    .int("Lock days must be a whole number.")
    .min(0, "Lock days cannot be negative.")
    .max(3650, "Lock days can be at most 3650.")
    .default(15),
  uniqueIdentifier: z.enum(["EMAIL", "MOBILE"]).default("EMAIL"),
  // Training/VSL link shown on the retake-lock screen, and the destination page the
  // respondent lands on. Both are required ONLY when the flow goes to an external
  // destination (nextStep DESTINATION or PAYMENT) - enforced in superRefine below.
  // For "Show results on assess360" (RESULTS) neither is needed, so both may be blank.
  // The destination origin authorizes the public read endpoint (CORS), so it must be https.
  trainingUrl: z
    .string()
    .url("Enter a valid Training / VSL URL.")
    .optional()
    .or(z.literal("")),
  targetUrl: z
    .string()
    .url("Enter a valid URL.")
    .startsWith("https://", "Destination URL must use https://")
    .optional()
    .or(z.literal("")),
  tokenTtlSeconds: z.coerce.number().int().min(60).max(7776000).optional(), // up to 90 days
  // "Show results on assess360" onward button: an optional plain external link shown
  // as a button under the result. https-only when present; blank => no button.
  resultsContinueUrl: z
    .string()
    .url("Enter a valid URL.")
    .startsWith("https://", "Continue URL must use https://")
    .optional()
    .or(z.literal("")),
  resultsContinueLabel: z.string().max(80).optional().or(z.literal("")),
  // Anticipation countdown (seconds) before the destination/VSL loads. 0 = instant.
  vslCountdownSeconds: z.coerce
    .number()
    .int("Countdown must be a whole number.")
    .min(0, "Countdown can't be negative.")
    .max(120, "Countdown can be at most 120 seconds.")
    .default(10),
  // How the questions are paginated for the respondent.
  questionDisplayMode: z.enum(["ALL", "CATEGORY", "SINGLE"]).default("ALL"),
  autoAdvanceLastScreen: z.boolean().default(false),
  resultLinkShowsResult: z.boolean().default(false),
  // Scoring/result engine. GENERIC = the built-in category-weight scorer.
  // CLINIC_AUDIT = the data-driven patient-acquisition funnel engine.
  engine: z.enum(["GENERIC", "CLINIC_AUDIT"]).default("GENERIC"),
  // Which AI result-instructions version drives this assessment. "" => tenant default.
  aiPromptVersionId: z.string().max(60).optional().or(z.literal("")),
  useAiStatement: z.boolean().default(true),
  // Explicit next step after the Results page. PAYMENT => take payment then go to
  // the destination; DESTINATION => straight to the destination/VSL. The save
  // action derives the legacy paidMode boolean from this.
  nextStep: z.enum(["PAYMENT", "DESTINATION", "RESULTS", "NO_RESULT"]).default("DESTINATION"),
  paymentUrl: z.string().url("Enter a valid payment URL.").optional().or(z.literal("")),
  // The query parameter an EXTERNAL gateway appends to its success redirect. A bare
  // parameter name, so it can be read off the URL without guessing.
  paymentReturnParam: z
    .string()
    .max(60)
    .regex(/^[A-Za-z0-9_.-]*$/, "Use only letters, numbers, dots, dashes or underscores.")
    .optional()
    .or(z.literal("")),
  paymentHeadline: z.string().max(2000).optional().or(z.literal("")),
  paymentButtonLabel: z.string().max(200).optional().or(z.literal("")),
  // Price in INR rupees for the Razorpay payment link (e.g. 199).
  paymentAmount: z.coerce.number().int().min(1).max(1000000).optional(),
  // Meta event fired on a verified paid unlock (default Purchase121).
  paymentEventName: z.string().max(80).optional().or(z.literal("")),
  // Payment notice on the opt-in form (above Start), paid mode only.
  paymentIntroText: z.string().max(2000).optional().or(z.literal("")),
  // ---- Audience gate + cascade routing (Phase 2) ----
  // A first-screen role dropdown with per-choice routing. Empty roles = no gate.
  // Each role's `target` (and noneTarget) is "" = continue in this assessment, else
  // an assessment id to redirect to (existence + no-cycle validated in the action).
  audienceGate: audienceGateSchema.default(EMPTY_AUDIENCE_GATE),
  /**
   * Which AD ACCOUNT this funnel reports to. "" = the workspace default.
   *
   * Validated in the action against the tenant's own accounts, never trusted from the
   * client: an id from another workspace would point a funnel at someone else's pixel,
   * and the only visible symptom would be a stranger's ad account filling up with
   * events it did not buy.
   */
  adAccountId: z.string().max(40).optional().or(z.literal("")),
  // Meta CAPI + pixel fire only when true (ad-entry assessment). Routed ones = false.
  fireMetaCapi: z.boolean().default(true),
  // Per-event selection, applied when fireMetaCapi is on. Every key optional and
  // defaulted ON, so an older client that does not send this object cannot silently
  // mute events that are feeding live ad audiences.
  metaEvents: z
    .object({
      registration: z.boolean().default(true),
      completion: z.boolean().default(true),
      gateDisqualified: z.boolean().default(true),
      abandoned: z.boolean().default(true),
      // Defaults OFF, unlike the four above: they are long-lived events whose
      // audiences already exist, so a client that omits them must not mute them.
      // This one is new, nothing can depend on it yet, and defaulting it on would
      // start a brand new event firing from every funnel on the platform.
      gateIncomplete: z.boolean().default(false),
      // Same reasoning, same answer: new event, nothing depends on it, off until asked.
      gatePassed: z.boolean().default(false),
    })
    .default({ registration: true, completion: true, gateDisqualified: true, abandoned: true, gateIncomplete: false, gatePassed: false }),
}).superRefine((d, ctx) => {
  if (d.nextStep === "PAYMENT" && !d.paymentAmount && !d.paymentUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAmount"],
      message: "Set a price (₹) or a payment link when the next step is Payment.",
    });
  }
  // Destination + Training/VSL links are required ONLY when the flow lands on an
  // external destination. "Show results on assess360" (RESULTS) needs neither.
  // NO_RESULT goes nowhere by definition, so neither link is required there either.
  if (d.nextStep !== "RESULTS" && d.nextStep !== "NO_RESULT") {
    if (!d.targetUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetUrl"], message: "Destination page URL is required for this next step." });
    }
    if (!d.trainingUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trainingUrl"], message: "Training / VSL link is required for this next step." });
    }
  }
  // The lock period only means something when the policy actually delays a retake.
  if (d.retakePolicy === "DELAYED" && d.retakeDays < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["retakeDays"],
      message: "Lock days must be at least 1.",
    });
  }
  // 🔴 SPLIT has nothing to write a lead against without an email.
  //
  // The email screen is where the lead row is created and emailCapturedAt stamped, so
  // a split funnel that does not collect one has no moment at which anybody becomes a
  // lead - it would run the three screens and produce nothing. Blocked on save with a
  // plain sentence rather than discovered live.
  if (d.leadCaptureMode === "SPLIT" && !d.collectEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["collectEmail"],
      message: "Split lead capture needs Email collected: it is the step that records the lead.",
    });
  }
  // A lockout can only be enforced if the identifying field is always captured.
  if (d.retakePolicy === "UNLIMITED") return;
  if (d.uniqueIdentifier === "EMAIL" && !(d.collectEmail && d.emailRequired)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["uniqueIdentifier"],
      message: "Retake lockout by Email requires Email to be collected and required.",
    });
  }
  if (d.uniqueIdentifier === "MOBILE" && !(d.collectMobile && d.mobileRequired)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["uniqueIdentifier"],
      message: "Retake lockout by Mobile requires Mobile to be collected and required.",
    });
  }
});
export type AssessmentInput = z.infer<typeof assessmentSchema>;

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required.").max(160),
  description: z.string().max(1000).optional().or(z.literal("")),
  // 1 = main assessment, 2 = the separate scored "queries" page.
  page: z.coerce.number().int().min(1).max(2).default(1),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const optionSchema = z.object({
  label: z.string().min(1, "Option label is required.").max(160),
  // GENERIC: the score point (e.g. 1..4). CLINIC_AUDIT: the working figure for the
  // question's role - rupees/counts as-is (90000, 90), rates & uplift as whole-number
  // percent (32 = 0.32). Wide bound so it can hold rupee treatment values.
  value: z.coerce.number().int().min(0).max(100_000_000),
  // CLINIC_AUDIT only (ignored by GENERIC): fixed weakest-area line for this answer,
  // and whether this is the "I don't know" option (→ assumption on the result page).
  diagnosisClause: z.string().max(300).optional().or(z.literal("")),
  isAssumption: z.boolean().default(false),
});

export const questionTypeSchema = z.enum(["SINGLE_SELECT", "FREE_TEXT"]);
export type QuestionTypeValue = z.infer<typeof questionTypeSchema>;

export const questionSchema = z
  .object({
  text: z.string().min(1, "Question text is required.").max(500),
  // SINGLE_SELECT = pick one option (scored). FREE_TEXT = type a sentence: no options,
  // no score, routes by the question's default route.
  type: questionTypeSchema.default("SINGLE_SELECT"),
  weight: z.coerce.number().min(0).max(100).default(1),
  required: z.boolean().default(true),
  // CLINIC_AUDIT only: the funnel role this question feeds (blank = not scored).
  // Validated against the engine's role list in the action; ignored by GENERIC.
  scoringRole: z.string().max(40).optional().or(z.literal("")),
  // CLINIC_AUDIT only: the unit the option numbers + typed actual number are in
  // (PER_10 / PER_100 / RUPEES / COUNT / POINTS). Blank = the role's default.
  scoringUnit: z.string().max(20).optional().or(z.literal("")),
    // A FREE_TEXT question has none; the refine below enforces two for a choice.
    options: z.array(optionSchema).max(10).default([]),
  })
  .refine((q) => q.type === "FREE_TEXT" || q.options.length >= 2, {
    message: "Provide at least two options.",
    path: ["options"],
  });
export type QuestionInput = z.infer<typeof questionSchema>;

export const bandLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const resultBandSchema = z
  .object({
    level: bandLevelSchema,
    title: z.string().min(1, "Title is required.").max(160),
    description: z.string().max(2000).optional().or(z.literal("")),
    // Result bands match against the score PERCENTAGE (0-100).
    minScore: z.coerce.number().min(0).max(100),
    maxScore: z.coerce.number().min(0).max(100),
  })
  .refine((b) => b.maxScore >= b.minScore, {
    message: "Max % must be greater than or equal to min %.",
    path: ["maxScore"],
  });
export type ResultBandInput = z.infer<typeof resultBandSchema>;

/**
 * Per-category evaluation band. Mirrors the overall result band but for a single
 * category: a LOW/MEDIUM/HIGH/CRITICAL level (stored as the category band label)
 * + an editable suggestion (stored as `meaning`), matched against the category's
 * own score PERCENTAGE (0-100).
 */
export const categoryBandSchema = z
  .object({
    categoryId: z.string().min(1, "Pick a category."),
    level: bandLevelSchema,
    suggestion: z.string().max(2000).optional().or(z.literal("")),
    minScore: z.coerce.number().min(0).max(100),
    maxScore: z.coerce.number().min(0).max(100),
  })
  .refine((b) => b.maxScore >= b.minScore, {
    message: "Max % must be greater than or equal to min %.",
    path: ["maxScore"],
  });
export type CategoryBandInput = z.infer<typeof categoryBandSchema>;

/** Reorder payload: an ordered list of ids. */
export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

/** Conditional routing (Phase 1). One rule per answer option; the option is the
 *  trigger. Target existence + forward-only ordering are enforced in the action
 *  (which has the DB context); this shape validates the payload only. */
export const routeActionSchema = z.enum([
  "NEXT",
  "JUMP_TO_QUESTION",
  "JUMP_TO_CATEGORY",
  "SKIP_TO_END",
]);
export type RouteActionValue = z.infer<typeof routeActionSchema>;

export const questionRouteInputSchema = z.object({
  optionId: z.string().min(1),
  action: routeActionSchema,
  targetQuestionId: z.string().max(60).optional().or(z.literal("")),
  targetCategoryId: z.string().max(60).optional().or(z.literal("")),
});
export type QuestionRouteInput = z.infer<typeof questionRouteInputSchema>;

/** The question's DEFAULT rule: used when no option rule applies - it was skipped,
 *  it is FREE_TEXT, or the chosen option carries no rule. Omitted = linear. */
export const defaultRouteInputSchema = z.object({
  action: routeActionSchema,
  targetQuestionId: z.string().max(60).optional().or(z.literal("")),
  targetCategoryId: z.string().max(60).optional().or(z.literal("")),
});
export type DefaultRouteInput = z.infer<typeof defaultRouteInputSchema>;

/** All routes for ONE question (its options' rules + its default), saved together. */
export const questionRoutesInputSchema = z.object({
  routes: z.array(questionRouteInputSchema).max(20),
  defaultRoute: defaultRouteInputSchema.optional(),
});
export type QuestionRoutesInput = z.infer<typeof questionRoutesInputSchema>;

/** Profession choices for the opt-in dropdown. The chosen LABEL is stored and
 * sent to the CRM verbatim, so this list is the single source of truth (form +
 * server-side membership check). */
export const PROFESSION_OPTIONS = [
  "Senior Management",
  "Middle Management",
  "Working Professional",
  "Employee",
  "Self Employed",
  "Business Owner",
  "Entrepreneur",
  "Doctor",
  "Lawyer",
  "Student",
  "Home Maker (House Wife)",
  "Unemployed",
  "Retired",
] as const;
export type Profession = (typeof PROFESSION_OPTIONS)[number];
export function isProfession(v: string): v is Profession {
  return (PROFESSION_OPTIONS as readonly string[]).includes(v);
}

/** The profession options for an assessment: its custom list, else the built-in
 *  default. Single source of truth for the dropdown AND the server membership check. */
export function professionOptionsFor(custom: readonly string[] | null | undefined): readonly string[] {
  return custom && custom.length > 0 ? custom : PROFESSION_OPTIONS;
}

/** Lead capture (public). Field-level requiredness is enforced per-assessment
 * config in the server action, so all fields are optional here. */
export const leadSchema = z.object({
  firstName: z.string().max(120).optional().or(z.literal("")),
  lastName: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email("Enter a valid email.").optional().or(z.literal("")),
  mobile: z.string().max(40).optional().or(z.literal("")),
  profession: z.string().max(120).optional().or(z.literal("")),
});
export type LeadInput = z.infer<typeof leadSchema>;

/** How long a typed (FREE_TEXT) answer may be. Generous enough for the paragraph
 *  somebody writes when they are annoyed, short enough not to be a payload. */
export const FREE_TEXT_ANSWER_MAX = 2000;

/** Answers submitted by a respondent: one option per question, or - for a FREE_TEXT
 *  question - the text they typed and no option. The server decides which shape each
 *  question requires, since only it knows the question's type. */
export const answersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        optionId: z.string().min(1).optional(),
        textValue: z.string().max(FREE_TEXT_ANSWER_MAX).optional(),
      }),
    )
    // NOT .min(1). A funnel can be built entirely from qualification gate questions, with
    // no scored questions behind them, and such a submission legitimately carries zero
    // answers. The schema cannot see the assessment, so it cannot tell that apart from a
    // genuinely empty submission; completeSubmission makes that call instead, where the
    // question count is known. See the emptiness guard there.
    .default([]),
});
export type AnswersInput = z.infer<typeof answersSchema>;

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

export const assessmentSchema = z.object({
  title: z.string().min(2, "Title is required.").max(160),
  slug: slugSchema,
  description: z.string().max(2000).optional().or(z.literal("")),
  coverImageUrl: z.string().url("Must be a valid URL.").optional().or(z.literal("")),
  estimatedMinutes: z.coerce.number().int().min(0).max(600).optional(),
  thankYouMessage: z.string().max(2000).optional().or(z.literal("")),
  // Lead-capture config.
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
  // Retake lockout config.
  retakePolicy: z.enum(["DELAYED", "NEVER", "UNLIMITED"]).default("DELAYED"),
  retakeDays: z.coerce
    .number()
    .int("Lock days must be a whole number.")
    .min(1, "Lock days must be at least 1.")
    .max(3650, "Lock days can be at most 3650.")
    .default(15),
  uniqueIdentifier: z.enum(["EMAIL", "MOBILE"]).default("EMAIL"),
  // Training/VSL link shown on the retake-lock screen. REQUIRED (may be the same
  // URL as the destination page).
  trainingUrl: z
    .string()
    .min(1, "Training / VSL link is required.")
    .url("Enter a valid Training / VSL URL."),
  // Destination page the respondent lands on after completing. REQUIRED. Its
  // origin authorizes the public read endpoint (CORS), so it must be https.
  targetUrl: z
    .string()
    .min(1, "Destination page URL is required.")
    .url("Enter a valid URL.")
    .startsWith("https://", "Destination URL must use https://"),
  tokenTtlSeconds: z.coerce.number().int().min(60).max(7776000).optional(), // up to 90 days
  // How the questions are paginated for the respondent.
  questionDisplayMode: z.enum(["ALL", "CATEGORY", "SINGLE"]).default("ALL"),
  // Explicit next step after the Results page. PAYMENT => take payment then go to
  // the destination; DESTINATION => straight to the destination/VSL. The save
  // action derives the legacy paidMode boolean from this.
  nextStep: z.enum(["PAYMENT", "DESTINATION"]).default("DESTINATION"),
  paymentUrl: z.string().url("Enter a valid payment URL.").optional().or(z.literal("")),
  paymentHeadline: z.string().max(2000).optional().or(z.literal("")),
  paymentButtonLabel: z.string().max(200).optional().or(z.literal("")),
  // Price in INR rupees for the Razorpay payment link (e.g. 199).
  paymentAmount: z.coerce.number().int().min(1).max(1000000).optional(),
  // Meta event fired on a verified paid unlock (default Purchase121).
  paymentEventName: z.string().max(80).optional().or(z.literal("")),
  // Payment notice on the opt-in form (above Start), paid mode only.
  paymentIntroText: z.string().max(2000).optional().or(z.literal("")),
}).superRefine((d, ctx) => {
  if (d.nextStep === "PAYMENT" && !d.paymentAmount && !d.paymentUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAmount"],
      message: "Set a price (₹) or a payment link when the next step is Payment.",
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
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const optionSchema = z.object({
  label: z.string().min(1, "Option label is required.").max(160),
  value: z.coerce.number().int().min(0).max(100),
});

export const questionSchema = z.object({
  text: z.string().min(1, "Question text is required.").max(500),
  weight: z.coerce.number().min(0).max(100).default(1),
  required: z.boolean().default(true),
  options: z
    .array(optionSchema)
    .min(2, "Provide at least two options.")
    .max(10),
});
export type QuestionInput = z.infer<typeof questionSchema>;

export const bandLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const resultBandSchema = z
  .object({
    level: bandLevelSchema,
    title: z.string().min(1, "Title is required.").max(160),
    description: z.string().max(2000).optional().or(z.literal("")),
    // Result bands match against the score PERCENTAGE (0–100).
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
 * own score PERCENTAGE (0–100).
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

/** Answers submitted by a respondent: one option per question. */
export const answersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        optionId: z.string().min(1),
      }),
    )
    .min(1, "Answer at least one question."),
});
export type AnswersInput = z.infer<typeof answersSchema>;

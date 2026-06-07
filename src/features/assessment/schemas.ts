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

/** Reorder payload: an ordered list of ids. */
export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

/** Lead capture (public). Field-level requiredness is enforced per-assessment
 * config in the server action, so all fields are optional here. */
export const leadSchema = z.object({
  firstName: z.string().max(120).optional().or(z.literal("")),
  lastName: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email("Enter a valid email.").optional().or(z.literal("")),
  mobile: z.string().max(40).optional().or(z.literal("")),
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

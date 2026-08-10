"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAssessment,
  updateAssessment,
} from "@/features/assessment/actions/assessment";
import type { AssessmentInput, PreResultField } from "@/features/assessment/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type AssessmentFormValues = AssessmentInput;

const LEAD_FIELDS = [
  { collect: "collectFirstName", required: "firstNameRequired", label: "First name", labelKey: "firstNameLabel" },
  { collect: "collectLastName", required: "lastNameRequired", label: "Last name", labelKey: "lastNameLabel" },
  { collect: "collectEmail", required: "emailRequired", label: "Email", labelKey: "emailLabel" },
  { collect: "collectMobile", required: "mobileRequired", label: "Mobile", labelKey: "mobileLabel" },
  { collect: "collectProfession", required: "professionRequired", label: "Profession", labelKey: "professionLabel" },
] as const;

/** Reusable editor for a list of custom fields (label + Text/Dropdown + options +
 *  required). Used for both the opt-in extra fields and the pre-results page. */
function CustomFieldsEditor({ fields, onChange }: { fields: PreResultField[]; onChange: (next: PreResultField[]) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field, idx) => (
        <div key={field.id} className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[12rem] flex-1"
              placeholder="Field label (e.g. Company size)"
              value={field.label}
              onChange={(e) => onChange(fields.map((f, i) => (i === idx ? { ...f, label: e.target.value } : f)))}
            />
            <select
              value={field.type}
              onChange={(e) => onChange(fields.map((f, i) => (i === idx ? { ...f, type: e.target.value as "text" | "select" } : f)))}
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="text">Text</option>
              <option value="select">Dropdown</option>
            </select>
            <label className="flex items-center gap-1 whitespace-nowrap text-sm">
              <input type="checkbox" checked={field.required} onChange={(e) => onChange(fields.map((f, i) => (i === idx ? { ...f, required: e.target.checked } : f)))} />
              Required
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(fields.filter((_, i) => i !== idx))}>Remove</Button>
          </div>
          {field.type === "select" ? (
            <Textarea
              rows={4}
              placeholder={"Dropdown options, one per line\n1-10 employees\n11-50 employees\n51-200 employees"}
              value={field.options.join("\n")}
              onChange={(e) => onChange(fields.map((f, i) => (i === idx ? { ...f, options: e.target.value.split("\n") } : f)))}
            />
          ) : null}
        </div>
      ))}
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...fields, { id: crypto.randomUUID(), label: "", type: "text", options: [], required: false }])}
        >
          + Add field
        </Button>
      </div>
    </div>
  );
}

/** Trim labels/options and drop fields with no label (before validation). */
function cleanFields(fields: PreResultField[]): PreResultField[] {
  return fields
    .map((f) => ({ ...f, label: f.label.trim(), options: f.options.map((o) => o.trim()).filter(Boolean) }))
    .filter((f) => f.label.length > 0);
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULTS: AssessmentFormValues = {
  title: "",
  slug: "",
  eyebrow: "",
  subheadline: "",
  description: "",
  buttonColor: "",
  buttonTextColor: "",
  preResultHeading: "",
  preResultSubtext: "",
  preResultFields: [],
  coverImageUrl: "",
  estimatedMinutes: undefined,
  thankYouMessage: "",
  collectFirstName: true,
  firstNameRequired: false,
  collectLastName: true,
  lastNameRequired: false,
  collectEmail: true,
  emailRequired: true,
  collectMobile: true,
  mobileRequired: false,
  collectProfession: true,
  professionRequired: true,
  professionOptions: [],
  firstNameLabel: "",
  lastNameLabel: "",
  emailLabel: "",
  mobileLabel: "",
  professionLabel: "",
  professionPlaceholder: "",
  leadCaptureAfter: false,
  optinFields: [],
  introNotice: "",
  startButtonLabel: "",
  retakePolicy: "DELAYED",
  retakeDays: 15,
  uniqueIdentifier: "EMAIL",
  trainingUrl: "",
  targetUrl: "",
  tokenTtlSeconds: undefined,
  vslCountdownSeconds: 10,
  questionDisplayMode: "ALL",
  aiPromptVersionId: "",
  useAiStatement: true,
  nextStep: "DESTINATION",
  paymentUrl: "",
  paymentHeadline: "",
  paymentButtonLabel: "",
  paymentAmount: undefined,
  paymentEventName: "Purchase121",
  paymentIntroText: "",
};

export function AssessmentForm({
  mode,
  id,
  initial,
  basePath = "/admin/assessments",
  promptVersions = [],
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: AssessmentFormValues;
  /** Where to send the user after create (edit stays in place). The tenant
   *  workspace passes /w/assessments so it never links into the admin console. */
  basePath?: string;
  /** The tenant's AI instruction versions, for the per-assessment selector. */
  promptVersions?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<AssessmentFormValues>(
    initial ?? DEFAULTS,
  );
  const [autoSlug, setAutoSlug] = useState(mode === "create");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof AssessmentFormValues>(
    key: K,
    value: AssessmentFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      // Clean the profession options + pre-result fields (drop blank lines / empty
      // fields) before validation.
      const payload = {
        ...values,
        professionOptions: values.professionOptions.map((s) => s.trim()).filter(Boolean),
        preResultFields: cleanFields(values.preResultFields),
        optinFields: cleanFields(values.optinFields),
      };
      const res =
        mode === "create"
          ? await createAssessment(payload)
          : await updateAssessment(id as string, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (mode === "create" && res.data) {
        router.push(`${basePath}/${res.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "New assessment" : "Settings"}</CardTitle>
        <CardDescription>Core details and lead capture.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="eyebrow">Eyebrow</Label>
            <Input
              id="eyebrow"
              value={values.eyebrow ?? ""}
              onChange={(e) => set("eyebrow", e.target.value)}
              placeholder="Small kicker shown above the headline"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Headline (title)</Label>
            <Input
              id="title"
              value={values.title}
              onChange={(e) => {
                const title = e.target.value;
                set("title", title);
                if (autoSlug) set("slug", slugify(title));
              }}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="subheadline">Sub-headline</Label>
            <Input
              id="subheadline"
              value={values.subheadline ?? ""}
              onChange={(e) => set("subheadline", e.target.value)}
              placeholder="Secondary line shown below the headline"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Slug (public URL: /a/&lt;slug&gt;)</Label>
            <Input
              id="slug"
              value={values.slug}
              onChange={(e) => {
                setAutoSlug(false);
                set("slug", e.target.value);
              }}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={values.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cover">Cover image URL</Label>
              <Input
                id="cover"
                value={values.coverImageUrl ?? ""}
                onChange={(e) => set("coverImageUrl", e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="minutes">Estimated time (minutes)</Label>
              <Input
                id="minutes"
                type="number"
                min={0}
                value={values.estimatedMinutes ?? ""}
                onChange={(e) =>
                  set(
                    "estimatedMinutes",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="thanks">Thank-you message</Label>
            <Textarea
              id="thanks"
              value={values.thankYouMessage ?? ""}
              onChange={(e) => set("thankYouMessage", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Lead capture</p>
            <div className="flex flex-col gap-2">
              {LEAD_FIELDS.map((f) => (
                <div key={f.collect} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="w-24 shrink-0">{f.label}</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={values[f.collect]}
                      onChange={(e) => set(f.collect, e.target.checked)}
                    />
                    Collect
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={values[f.required]}
                      disabled={!values[f.collect]}
                      onChange={(e) => set(f.required, e.target.checked)}
                    />
                    Required
                  </label>
                  <Input
                    className="h-8 max-w-[13rem] flex-1 text-sm"
                    placeholder={`Label (default: ${f.label})`}
                    value={values[f.labelKey] ?? ""}
                    disabled={!values[f.collect]}
                    onChange={(e) => set(f.labelKey, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border p-4">
            <p className="text-sm font-medium">Opt-in screen copy</p>

            <div className="flex flex-col gap-2">
              <Label htmlFor="introNotice">Intro notice</Label>
              <Textarea
                id="introNotice"
                rows={2}
                placeholder="Leave blank to auto-show the retake message (e.g. “…can't retake for 15 days”)."
                value={values.introNotice ?? ""}
                onChange={(e) => set("introNotice", e.target.value)}
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Shown in the amber box above the form. If set, it <strong>replaces</strong> the
                automatic retake message.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="startButtonLabel">Start button text</Label>
              <Input
                id="startButtonLabel"
                className="max-w-xs"
                placeholder="Start"
                value={values.startButtonLabel ?? ""}
                onChange={(e) => set("startButtonLabel", e.target.value)}
              />
            </div>

            {values.collectProfession ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="professionPlaceholder">Profession dropdown placeholder</Label>
                  <Input
                    id="professionPlaceholder"
                    className="max-w-md"
                    placeholder="Select your profession"
                    value={values.professionPlaceholder ?? ""}
                    onChange={(e) => set("professionPlaceholder", e.target.value)}
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">
                    The greyed “choose…” text at the top of the dropdown. Blank = “Select your profession”.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="professionOptions">Profession dropdown options</Label>
                  <Textarea
                    id="professionOptions"
                    rows={6}
                    placeholder={"One per line. Leave blank to use the built-in list.\nSenior Management\nBusiness Owner\nDoctor"}
                    value={(values.professionOptions ?? []).join("\n")}
                    onChange={(e) => set("professionOptions", e.target.value.split("\n"))}
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">
                    One option per line. Blank = the built-in 13 professions. The exact label is
                    stored and sent to your CRM.
                  </p>
                </div>
              </>
            ) : null}

            <div className="flex flex-col gap-1 border-t pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values.leadCaptureAfter}
                  onChange={(e) => set("leadCaptureAfter", e.target.checked)}
                />
                Collect the lead AFTER the assessment
              </label>
              <p className="text-xs text-[var(--muted-foreground)]">
                Off (default): the opt-in form is the first screen. On: show a landing (headline +
                Start), ask the questions (page 1 → page 2), THEN show the opt-in form, then results.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border p-4">
            <p className="text-sm font-medium">Button colours</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              The funnel&apos;s primary buttons. Blank = the default green / white.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="buttonColor">Button colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={values.buttonColor || "#16a34a"} onChange={(e) => set("buttonColor", e.target.value)} className="h-9 w-12 shrink-0 rounded border" />
                  <Input id="buttonColor" className="max-w-[10rem]" placeholder="#16a34a" value={values.buttonColor ?? ""} onChange={(e) => set("buttonColor", e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="buttonTextColor">Button text colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={values.buttonTextColor || "#ffffff"} onChange={(e) => set("buttonTextColor", e.target.value)} className="h-9 w-12 shrink-0 rounded border" />
                  <Input id="buttonTextColor" className="max-w-[10rem]" placeholder="#ffffff" value={values.buttonTextColor ?? ""} onChange={(e) => set("buttonTextColor", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border p-4">
            <p className="text-sm font-medium">Pre-results details page</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Optional. Shown after the questions, before results. Answers are saved against the
              lead. No fields = no extra page.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="preResultHeading">Page heading</Label>
                <Input id="preResultHeading" placeholder="A few last details" value={values.preResultHeading ?? ""} onChange={(e) => set("preResultHeading", e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="preResultSubtext">Sub-text</Label>
                <Input id="preResultSubtext" value={values.preResultSubtext ?? ""} onChange={(e) => set("preResultSubtext", e.target.value)} />
              </div>
            </div>

            <CustomFieldsEditor fields={values.preResultFields} onChange={(next) => set("preResultFields", next)} />
          </div>

          <div className="flex flex-col gap-4 rounded-lg border p-4">
            <p className="text-sm font-medium">Extra opt-in fields</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Additional questions shown on the opt-in form, below Profession. Text or dropdown;
              answers are saved against the lead. No fields = the standard form.
            </p>
            <CustomFieldsEditor fields={values.optinFields} onChange={(next) => set("optinFields", next)} />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Retake policy</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Controls how often a respondent (identified below) may retake. Preserves
              history — each retake is a new submission.
            </p>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Allow retakes?</legend>
              {[
                { v: "DELAYED", label: "Delayed — allow again after a cooling period" },
                { v: "NEVER", label: "Never — one submission only" },
                { v: "UNLIMITED", label: "Unlimited — immediate retakes" },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="retakePolicy"
                    checked={values.retakePolicy === o.v}
                    onChange={() => set("retakePolicy", o.v as AssessmentFormValues["retakePolicy"])}
                  />
                  {o.label}
                </label>
              ))}
            </fieldset>

            {values.retakePolicy === "DELAYED" ? (
              <div className="flex flex-col gap-2 border-l-2 pl-4">
                <Label htmlFor="retakeDays">Lock period (days before a retake is allowed)</Label>
                <Input
                  id="retakeDays"
                  type="number"
                  min={1}
                  max={3650}
                  className="w-40"
                  value={values.retakeDays}
                  onChange={(e) =>
                    set("retakeDays", e.target.value === "" ? 1 : Math.max(1, Number(e.target.value)))
                  }
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Any number of days (e.g. 15, 30, 90). Applies to this assessment only.
                </p>
              </div>
            ) : null}

            {values.retakePolicy !== "UNLIMITED" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Identify respondents by</legend>
                <p className="text-xs text-[var(--muted-foreground)]">
                  The chosen field must be collected and required (set above).
                </p>
                {[
                  { v: "EMAIL", label: "Email address" },
                  { v: "MOBILE", label: "Mobile number" },
                ].map((o) => (
                  <label key={o.v} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="uniqueIdentifier"
                      checked={values.uniqueIdentifier === o.v}
                      onChange={() => set("uniqueIdentifier", o.v as AssessmentFormValues["uniqueIdentifier"])}
                    />
                    {o.label}
                  </label>
                ))}
              </fieldset>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="trainingUrl">
                Training / VSL link (shown on the retake-lock screen){" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="trainingUrl"
                required
                value={values.trainingUrl ?? ""}
                onChange={(e) => set("trainingUrl", e.target.value)}
                placeholder="https://…"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Required. Can be the same URL as the destination page below.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Destination page</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Where respondents land after finishing (we append <span className="font-mono">?t=&lt;token&gt;</span>).
              This page is also what the result endpoint authorizes (CORS).
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="targetUrl">
                Destination page URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="targetUrl"
                required
                value={values.targetUrl ?? ""}
                onChange={(e) => set("targetUrl", e.target.value)}
                placeholder="https://your-page.com/results"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Required, must be https. Can be the same URL as the Training / VSL link above.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tokenTtl">Result link lifetime (seconds)</Label>
              <Input
                id="tokenTtl"
                type="number"
                min={60}
                max={7776000}
                className="w-40"
                value={values.tokenTtlSeconds ?? ""}
                onChange={(e) =>
                  set("tokenTtlSeconds", e.target.value === "" ? undefined : Number(e.target.value))
                }
                placeholder="2592000"
              />
              <p className="text-xs text-[var(--muted-foreground)]">Default 30 days (2592000s) if blank. Keep it long so emailed/revisited result links don&apos;t expire.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="vslCountdown">Countdown before destination (seconds)</Label>
              <Input
                id="vslCountdown"
                type="number"
                min={0}
                max={120}
                className="w-40"
                value={values.vslCountdownSeconds ?? 10}
                onChange={(e) =>
                  set("vslCountdownSeconds", e.target.value === "" ? 0 : Number(e.target.value))
                }
                placeholder="10"
              />
              <p className="text-xs text-[var(--muted-foreground)]">Anticipation timer shown after Submit before the destination/VSL loads. 0 = redirect immediately. Default 10.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium">AI result instructions</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.useAiStatement}
                onChange={(e) => set("useAiStatement", e.target.checked)}
              />
              Use an AI personal statement in the results
            </label>
            <p className="text-xs text-[var(--muted-foreground)]">
              Off = no AI message is generated or shown — the scores, bands and your template convey
              the result. When on, pick which system-prompt version drives it (manage under AI →
              System prompt versions).
            </p>
            <select
              className="h-10 max-w-md rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm disabled:opacity-50"
              value={values.aiPromptVersionId ?? ""}
              disabled={!values.useAiStatement}
              onChange={(e) => set("aiPromptVersionId", e.target.value)}
            >
              <option value="">Tenant default</option>
              {promptVersions.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">How questions are shown</p>
            <div className="flex flex-col gap-2 text-sm">
              {([
                ["ALL", "All on one page", "Every question on a single page."],
                ["CATEGORY", "Category-wise", "One page per category (Next / Back)."],
                ["SINGLE", "One question at a time", "A single question per page, with its category name."],
              ] as const).map(([val, label, hint]) => (
                <label key={val} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="questionDisplayMode"
                    className="mt-1"
                    checked={values.questionDisplayMode === val}
                    onChange={() => set("questionDisplayMode", val)}
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-[var(--muted-foreground)]">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Next step after results</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              What happens after the Results page. Every flow resolves to one of these.
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="nextStep"
                  className="mt-1"
                  checked={values.nextStep === "DESTINATION"}
                  onChange={() => set("nextStep", "DESTINATION")}
                />
                <span>
                  <span className="font-medium">Destination page (VSL)</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">No payment — submit goes straight to the destination page (carrying the token).</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="nextStep"
                  className="mt-1"
                  checked={values.nextStep === "RESULTS"}
                  onChange={() => set("nextStep", "RESULTS")}
                />
                <span>
                  <span className="font-medium">Show results on assess360</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">No external VSL — show the results on our own result page. Webhooks/CRM firing stays the same.</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="nextStep"
                  className="mt-1"
                  checked={values.nextStep === "PAYMENT"}
                  onChange={() => set("nextStep", "PAYMENT")}
                />
                <span>
                  <span className="font-medium">Payment</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">Take payment (Razorpay or your static link), then the destination page.</span>
                </span>
              </label>
            </div>
            {values.nextStep === "PAYMENT" ? (
              <div className="flex flex-col gap-3 border-l-2 pl-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="paymentAmount">Price (₹)</Label>
                  <Input
                    id="paymentAmount"
                    type="number"
                    min={1}
                    className="w-40"
                    value={values.paymentAmount ?? ""}
                    onChange={(e) =>
                      set("paymentAmount", e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="199"
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">
                    When Razorpay is configured, submit opens Razorpay Checkout (prefilled) for this
                    amount; after paying, the user lands on your destination page with the token. If
                    Razorpay isn&apos;t set, the static link below is used instead.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="paymentEventName">Meta conversion event name</Label>
                  <Input
                    id="paymentEventName"
                    className="w-60"
                    value={values.paymentEventName ?? ""}
                    onChange={(e) => set("paymentEventName", e.target.value)}
                    placeholder="Purchase121"
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Fired to Meta (CAPI + browser pixel, deduped) on a verified payment, with value +
                    currency. Custom + price-independent — keep it stable as you change the price.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="paymentUrl">Static payment link URL (fallback)</Label>
                  <Input
                    id="paymentUrl"
                    value={values.paymentUrl ?? ""}
                    onChange={(e) => set("paymentUrl", e.target.value)}
                    placeholder="https://your-payment-page.com/pay"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="paymentIntroText">Payment notice (opt-in form, above Start)</Label>
                  <Textarea
                    id="paymentIntroText"
                    value={values.paymentIntroText ?? ""}
                    onChange={(e) => set("paymentIntroText", e.target.value)}
                    placeholder="After the assessment, unlock your score + a 1-on-1 consultation with GND for ₹199."
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Shown on the opt-in form before they start — so the payment is no surprise.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="paymentHeadline">Headline (shown on the submit screen)</Label>
                  <Textarea
                    id="paymentHeadline"
                    value={values.paymentHeadline ?? ""}
                    onChange={(e) => set("paymentHeadline", e.target.value)}
                    placeholder="See your score + a 1-on-1 consultation with GND for ₹199 only."
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="paymentButtonLabel">Submit button text (nudge)</Label>
                  <Input
                    id="paymentButtonLabel"
                    value={values.paymentButtonLabel ?? ""}
                    onChange={(e) => set("paymentButtonLabel", e.target.value)}
                    placeholder="Pay ₹199 to unlock your results & book your call"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create assessment" : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

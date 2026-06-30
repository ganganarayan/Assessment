"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAssessment,
  updateAssessment,
} from "@/features/assessment/actions/assessment";
import type { AssessmentInput } from "@/features/assessment/schemas";
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
  { collect: "collectFirstName", required: "firstNameRequired", label: "First name" },
  { collect: "collectLastName", required: "lastNameRequired", label: "Last name" },
  { collect: "collectEmail", required: "emailRequired", label: "Email" },
  { collect: "collectMobile", required: "mobileRequired", label: "Mobile" },
  { collect: "collectProfession", required: "professionRequired", label: "Profession" },
] as const;

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
  description: "",
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
  retakePolicy: "DELAYED",
  retakeDays: 15,
  uniqueIdentifier: "EMAIL",
  trainingUrl: "",
  targetUrl: "",
  tokenTtlSeconds: undefined,
  vslCountdownSeconds: 10,
  questionDisplayMode: "ALL",
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
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: AssessmentFormValues;
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
      const res =
        mode === "create"
          ? await createAssessment(values)
          : await updateAssessment(id as string, values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (mode === "create" && res.data) {
        router.push(`/admin/assessments/${res.data.id}`);
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
            <Label htmlFor="title">Title</Label>
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
                <div key={f.collect} className="flex items-center gap-6 text-sm">
                  <span className="w-24">{f.label}</span>
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
                </div>
              ))}
            </div>
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

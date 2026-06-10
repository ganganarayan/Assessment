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
  retakePolicy: "DELAYED",
  retakeDays: 15,
  uniqueIdentifier: "EMAIL",
  trainingUrl: "",
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
              <Label htmlFor="trainingUrl">Training / VSL link (shown on the retake-lock screen)</Label>
              <Input
                id="trainingUrl"
                value={values.trainingUrl ?? ""}
                onChange={(e) => set("trainingUrl", e.target.value)}
                placeholder="https://…"
              />
            </div>
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

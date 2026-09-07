import { notFound } from "next/navigation";
import { getPublishedAssessmentBySlug, getPublishedSlugById } from "@/features/assessment/data";
import { pickAttribution } from "@/lib/attribution";
import {
  AssessmentRunner,
  type PublicAssessment,
} from "@/features/assessment/components/public/assessment-runner";
import { readPublishedPages } from "@/features/assessment/pages/blocks";
import { type PreResultField } from "@/features/assessment/schemas";

export const dynamic = "force-dynamic";

export default async function PublicAssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const attribution = pickAttribution((k) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  });
  const preview = sp.preview === "1"; // admin-only bypass; verified server-side
  const a = await getPublishedAssessmentBySlug(slug);
  if (!a) notFound();

  // Audience gate (Phase 2): resolve each choice's redirect target to a PUBLISHED
  // slug (a draft target is dropped, so a respondent is never sent to a dead page).
  // A role with no target continues in THIS assessment (redirectSlug null).
  const gateRaw = (a.audienceGate ?? null) as {
    label?: string;
    placeholder?: string;
    roles?: { id: string; label: string; target?: string }[];
    noneEnabled?: boolean;
    noneLabel?: string;
    noneTarget?: string;
  } | null;
  let audienceGate: PublicAssessment["audienceGate"] = null;
  if (gateRaw && Array.isArray(gateRaw.roles) && gateRaw.roles.length > 0) {
    const options: { key: string; label: string; redirectSlug: string | null }[] = [];
    for (const r of gateRaw.roles) {
      if (!r?.label) continue;
      if (!r.target) {
        options.push({ key: r.id, label: r.label, redirectSlug: null }); // continue here
        continue;
      }
      const slug = await getPublishedSlugById(r.target);
      if (slug) options.push({ key: r.id, label: r.label, redirectSlug: slug });
    }
    if (gateRaw.noneEnabled && gateRaw.noneTarget) {
      const slug = await getPublishedSlugById(gateRaw.noneTarget);
      if (slug) {
        options.push({ key: "__none__", label: gateRaw.noneLabel?.trim() || "None of the above", redirectSlug: slug });
      }
    }
    if (options.length > 0) {
      audienceGate = {
        label: gateRaw.label?.trim() || null,
        placeholder: gateRaw.placeholder?.trim() || null,
        options,
      };
    }
  }

  const assessment: PublicAssessment = {
    slug: a.slug,
    title: a.title,
    eyebrow: a.eyebrow,
    subheadline: a.subheadline,
    description: a.description,
    buttonColor: a.buttonColor,
    buttonTextColor: a.buttonTextColor,
    preResultHeading: a.preResultHeading,
    preResultSubtext: a.preResultSubtext,
    preResultFields: ((a.preResultFields as PreResultField[] | null) ?? []).filter((f) => f && f.label),
    coverImageUrl: a.coverImageUrl,
    estimatedMinutes: a.estimatedMinutes,
    trainingUrl: a.trainingUrl,
    retakePolicy: a.retakePolicy,
    retakeDays: a.retakeDays,
    collectFirstName: a.collectFirstName,
    firstNameRequired: a.firstNameRequired,
    collectLastName: a.collectLastName,
    lastNameRequired: a.lastNameRequired,
    collectEmail: a.collectEmail,
    emailRequired: a.emailRequired,
    collectMobile: a.collectMobile,
    mobileRequired: a.mobileRequired,
    collectProfession: a.collectProfession,
    professionRequired: a.professionRequired,
    professionOptions: a.professionOptions,
    firstNameLabel: a.firstNameLabel,
    lastNameLabel: a.lastNameLabel,
    emailLabel: a.emailLabel,
    mobileLabel: a.mobileLabel,
    professionLabel: a.professionLabel,
    professionPlaceholder: a.professionPlaceholder,
    leadCaptureAfter: a.leadCaptureAfter,
    optinFields: ((a.optinFields as PreResultField[] | null) ?? []).filter((f) => f && f.label),
    introNotice: a.introNotice,
    startButtonLabel: a.startButtonLabel,
    resultsButtonLabel: a.resultsButtonLabel,
    paidMode: a.paidMode,
    vslCountdownSeconds: a.vslCountdownSeconds,
    questionDisplayMode: a.questionDisplayMode,
    paymentHeadline: a.paymentHeadline,
    paymentButtonLabel: a.paymentButtonLabel,
    paymentIntroText: a.paymentIntroText,
    // Audience gate (Phase 2).
    audienceGate,
    // Public renders ONLY the published snapshot (never the draft rows).
    pages: readPublishedPages(a.publishedPages),
    categories: a.categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      page: c.page,
      questions: c.questions.map((q) => ({
        id: q.id,
        text: q.text,
        required: q.required,
        scoringRole: q.scoringRole,
        scoringUnit: q.scoringUnit,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          route: o.route
            ? {
                action: o.route.action,
                targetQuestionId: o.route.targetQuestionId,
                targetCategoryId: o.route.targetCategoryId,
              }
            : null,
        })),
      })),
    })),
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <AssessmentRunner assessment={assessment} attribution={attribution} preview={preview} />
    </main>
  );
}

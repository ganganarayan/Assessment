import { notFound } from "next/navigation";
import { getPublishedAssessmentBySlug } from "@/features/assessment/data";
import { pickAttribution } from "@/lib/attribution";
import {
  AssessmentRunner,
  type PublicAssessment,
} from "@/features/assessment/components/public/assessment-runner";

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

  const assessment: PublicAssessment = {
    slug: a.slug,
    title: a.title,
    description: a.description,
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
    paidMode: a.paidMode,
    paymentHeadline: a.paymentHeadline,
    paymentButtonLabel: a.paymentButtonLabel,
    paymentIntroText: a.paymentIntroText,
    categories: a.categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      questions: c.questions.map((q) => ({
        id: q.id,
        text: q.text,
        required: q.required,
        options: q.options.map((o) => ({ id: o.id, label: o.label, value: o.value })),
      })),
    })),
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <AssessmentRunner assessment={assessment} attribution={attribution} preview={preview} />
    </main>
  );
}

import { notFound } from "next/navigation";
import { getPublishedAssessmentBySlug } from "@/features/assessment/data";
import {
  AssessmentRunner,
  type PublicAssessment,
} from "@/features/assessment/components/public/assessment-runner";

export const dynamic = "force-dynamic";

export default async function PublicAssessmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await getPublishedAssessmentBySlug(slug);
  if (!a) notFound();

  const assessment: PublicAssessment = {
    slug: a.slug,
    title: a.title,
    description: a.description,
    coverImageUrl: a.coverImageUrl,
    estimatedMinutes: a.estimatedMinutes,
    collectFirstName: a.collectFirstName,
    firstNameRequired: a.firstNameRequired,
    collectLastName: a.collectLastName,
    lastNameRequired: a.lastNameRequired,
    collectEmail: a.collectEmail,
    emailRequired: a.emailRequired,
    collectMobile: a.collectMobile,
    mobileRequired: a.mobileRequired,
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
      <AssessmentRunner assessment={assessment} />
    </main>
  );
}

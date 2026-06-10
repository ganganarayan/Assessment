import { notFound } from "next/navigation";
import { getPublishedAssessmentBySlug } from "@/features/assessment/data";
import {
  AssessmentRunner,
  type PublicAssessment,
} from "@/features/assessment/components/public/assessment-runner";

export const dynamic = "force-dynamic";

/** UTM + click-id params captured from the landing URL. */
const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
] as const;

function pickAttribution(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const raw = sp[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.trim()) out[key] = value;
  }
  return out;
}

export default async function PublicAssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const attribution = pickAttribution(await searchParams);
  const a = await getPublishedAssessmentBySlug(slug);
  if (!a) notFound();

  const assessment: PublicAssessment = {
    slug: a.slug,
    title: a.title,
    description: a.description,
    coverImageUrl: a.coverImageUrl,
    estimatedMinutes: a.estimatedMinutes,
    trainingUrl: a.trainingUrl,
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
      <AssessmentRunner assessment={assessment} attribution={attribution} />
    </main>
  );
}

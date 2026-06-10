import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessmentById } from "@/features/assessment/data";
import { AssessmentForm, type AssessmentFormValues } from "@/features/assessment/components/admin/assessment-form";
import { CategoriesManager } from "@/features/assessment/components/admin/categories-manager";
import { ResultBandsManager } from "@/features/assessment/components/admin/result-bands-manager";
import { AssessmentRowActions } from "@/features/assessment/components/admin/assessment-row-actions";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function EditAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await getAssessmentById(id);
  if (!a) notFound();

  const initial: AssessmentFormValues = {
    title: a.title,
    slug: a.slug,
    description: a.description ?? "",
    coverImageUrl: a.coverImageUrl ?? "",
    estimatedMinutes: a.estimatedMinutes ?? undefined,
    thankYouMessage: a.thankYouMessage ?? "",
    collectFirstName: a.collectFirstName,
    firstNameRequired: a.firstNameRequired,
    collectLastName: a.collectLastName,
    lastNameRequired: a.lastNameRequired,
    collectEmail: a.collectEmail,
    emailRequired: a.emailRequired,
    collectMobile: a.collectMobile,
    mobileRequired: a.mobileRequired,
    retakePolicy: a.retakePolicy,
    retakeDays: a.retakeDays,
    uniqueIdentifier: a.uniqueIdentifier,
    trainingUrl: a.trainingUrl ?? "",
  };

  const categories = a.categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    questions: c.questions.map((q) => ({
      id: q.id,
      text: q.text,
      weight: q.weight,
      required: q.required,
      options: q.options.map((o) => ({ id: o.id, label: o.label, value: o.value })),
    })),
  }));

  const bands = a.resultBands.map((b) => ({
    id: b.id,
    level: b.level,
    title: b.title,
    description: b.description,
    minScore: b.minScore,
    maxScore: b.maxScore,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/admin/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{a.title}</h1>
            <Badge variant={a.status === "PUBLISHED" ? "success" : "muted"}>
              {a.status}
            </Badge>
          </div>
          <AssessmentRowActions id={a.id} slug={a.slug} published={a.status === "PUBLISHED"} />
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Public URL: <span className="font-mono">/a/{a.slug}</span>
        </p>
      </div>

      <AssessmentForm mode="edit" id={a.id} initial={initial} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Categories &amp; Questions</h2>
        <CategoriesManager assessmentId={a.id} categories={categories} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Result Bands</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Bands are matched against the score <strong>percentage (0–100)</strong>,
          so results stay comparable even when optional questions are skipped.
          Ranges must not overlap; cover 0–100 with no gaps.
        </p>
        <ResultBandsManager assessmentId={a.id} bands={bands} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { getAssessmentById } from "@/features/assessment/data";
import { listPromptVersions } from "@/lib/ai/versions";
import { AssessmentForm, type AssessmentFormValues } from "@/features/assessment/components/admin/assessment-form";
import { ConnectDestination } from "@/features/assessment/components/admin/connect-destination";
import { CategoriesManager } from "@/features/assessment/components/admin/categories-manager";
import { env } from "@/lib/env";
import { ResultBandsManager } from "@/features/assessment/components/admin/result-bands-manager";
import { CategoryBandsManager } from "@/features/assessment/components/admin/category-bands-manager";
import { PagesBuilder } from "@/features/assessment/components/admin/pages-builder";
import { BuilderTabPanels } from "@/features/assessment/components/admin/builder-tab-panels";
import { WorkspaceAssessmentActions } from "@/features/workspace/components/workspace-assessment-actions";
import { type BlockType, normalizePages, readPublishedPages } from "@/features/assessment/pages/blocks";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function WorkspaceEditAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenantId } = await requireWorkspace();
  const { id } = await params;
  const a = await getAssessmentById(id);
  // Ownership gate: the assessment must belong to THIS workspace's tenant.
  if (!a || a.tenantId !== tenantId) notFound();
  if (!(await currentUserCanEdit())) redirect("/w/assessments");
  const promptVersions = (await listPromptVersions(tenantId)).map((v) => ({ id: v.id, label: v.label }));

  const initial: AssessmentFormValues = {
    title: a.title,
    slug: a.slug,
    eyebrow: a.eyebrow ?? "",
    subheadline: a.subheadline ?? "",
    description: a.description ?? "",
    buttonColor: a.buttonColor ?? "",
    buttonTextColor: a.buttonTextColor ?? "",
    preResultHeading: a.preResultHeading ?? "",
    preResultSubtext: a.preResultSubtext ?? "",
    preResultFields: (a.preResultFields as AssessmentFormValues["preResultFields"] | null) ?? [],
    optinFields: (a.optinFields as AssessmentFormValues["optinFields"] | null) ?? [],
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
    collectProfession: a.collectProfession,
    professionRequired: a.professionRequired,
    professionOptions: a.professionOptions,
    firstNameLabel: a.firstNameLabel ?? "",
    lastNameLabel: a.lastNameLabel ?? "",
    emailLabel: a.emailLabel ?? "",
    mobileLabel: a.mobileLabel ?? "",
    professionLabel: a.professionLabel ?? "",
    professionPlaceholder: a.professionPlaceholder ?? "",
    leadCaptureAfter: a.leadCaptureAfter,
    introNotice: a.introNotice ?? "",
    startButtonLabel: a.startButtonLabel ?? "",
    retakePolicy: a.retakePolicy,
    retakeDays: a.retakeDays,
    uniqueIdentifier: a.uniqueIdentifier,
    trainingUrl: a.trainingUrl ?? "",
    targetUrl: a.targetUrl ?? "",
    tokenTtlSeconds: a.tokenTtlSeconds ?? undefined,
    vslCountdownSeconds: a.vslCountdownSeconds,
    questionDisplayMode: a.questionDisplayMode,
    engine: a.engine,
    aiPromptVersionId: a.aiPromptVersionId ?? "",
    useAiStatement: a.useAiStatement,
    nextStep: a.nextStep,
    paymentUrl: a.paymentUrl ?? "",
    paymentHeadline: a.paymentHeadline ?? "",
    paymentButtonLabel: a.paymentButtonLabel ?? "",
    paymentAmount: a.paymentAmount ?? undefined,
    paymentEventName: a.paymentEventName ?? "Purchase121",
    paymentIntroText: a.paymentIntroText ?? "",
  };

  const categories = a.categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    page: c.page,
    questions: c.questions.map((q) => ({
      id: q.id,
      text: q.text,
      weight: q.weight,
      required: q.required,
      scoringRole: q.scoringRole,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        diagnosisClause: o.diagnosisClause,
        isAssumption: o.isAssumption,
      })),
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

  const bandWords: Record<string, string> = Object.fromEntries(
    a.resultBands.map((b) => [b.level, b.title]),
  );

  const initialPages = a.pages.map((p) => ({
    id: p.id,
    order: p.order,
    title: p.title,
    blocks: p.blocks.map((b) => ({
      id: b.id,
      type: b.type as BlockType,
      order: b.order,
      config: (b.config ?? {}) as Record<string, unknown>,
    })),
  }));

  const publishedPages = readPublishedPages(a.publishedPages);
  const initialDirty = normalizePages(initialPages) !== normalizePages(publishedPages);

  const categoryOptions = a.categories.map((c) => ({ id: c.id, name: c.name }));
  const categoryBands = a.categories.flatMap((c) =>
    c.bands.map((b) => ({
      id: b.id,
      categoryId: c.id,
      categoryName: c.name,
      level: b.label,
      suggestion: b.meaning,
      minScore: b.minScore,
      maxScore: b.maxScore,
    })),
  );

  const assessmentTab = (
    <>
      <AssessmentForm mode="edit" id={a.id} initial={initial} basePath="/w/assessments" promptVersions={promptVersions} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Connect your destination page</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Paste a URL above (Destination page), save, then copy this connector into your page.
        </p>
        <ConnectDestination targetUrl={a.targetUrl} endpointBase={env.NEXT_PUBLIC_APP_URL} bandWords={bandWords} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Categories &amp; Questions</h2>
        <CategoriesManager assessmentId={a.id} categories={categories} engine={a.engine} />
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Category Evaluation Bands</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Per-category evaluation shown on the destination page. Pick a category, a
          level, the <strong>category&apos;s own</strong> score range (its score ÷ its max,
          0–100), and a suggestion. Ranges must not overlap within a category.
        </p>
        <CategoryBandsManager categories={categoryOptions} bands={categoryBands} />
      </section>
    </>
  );

  const resultsTab = (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Results page</h2>
      <p className="text-xs text-[var(--muted-foreground)]">
        The single page shown after the questions. Add blocks, then click{" "}
        <strong>Publish</strong> to make them live. The step after this page (Payment or
        Destination) is set under <em>Assessment → Next step after results</em>.
      </p>
      <PagesBuilder
        assessmentId={a.id}
        initialPages={initialPages}
        bandTitles={bandWords}
        initialDirty={initialDirty}
        initialPublished={publishedPages.length > 0}
        lastPublishedAt={a.pagesPublishedAt ? a.pagesPublishedAt.toISOString() : null}
      />
    </section>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/w/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{a.title}</h1>
            <Badge variant={a.status === "PUBLISHED" ? "success" : "muted"}>{a.status}</Badge>
          </div>
          <WorkspaceAssessmentActions id={a.id} slug={a.slug} published={a.status === "PUBLISHED"} />
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Public URL: <span className="font-mono">/a/{a.slug}</span>
        </p>
      </div>

      <BuilderTabPanels
        tabs={[
          { key: "assessment", content: assessmentTab },
          { key: "results", content: resultsTab },
        ]}
      />
    </div>
  );
}

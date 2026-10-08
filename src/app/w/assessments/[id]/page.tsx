import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { getAssessmentById, listAssessments } from "@/features/assessment/data";
import { buildSpine } from "@/lib/routing/engine";
import {
  EMPTY_AUDIENCE_GATE,
  EMPTY_QUALIFICATION,
  EMPTY_DISQUALIFIED,
  qualificationSchema,
  disqualifiedContentSchema,
  type AudienceGateInput,
} from "@/features/assessment/schemas";
import { QualificationManager } from "@/features/assessment/components/admin/qualification-manager";
import { listPromptVersions } from "@/lib/ai/versions";
import { AssessmentForm, type AssessmentFormValues } from "@/features/assessment/components/admin/assessment-form";
import { ConnectDestination } from "@/features/assessment/components/admin/connect-destination";
import { CategoriesManager } from "@/features/assessment/components/admin/categories-manager";
import { env } from "@/lib/env";
import { ResultBandsManager } from "@/features/assessment/components/admin/result-bands-manager";
import { CategoryBandsManager } from "@/features/assessment/components/admin/category-bands-manager";
import { PagesBuilder } from "@/features/assessment/components/admin/pages-builder";
import { ResultPageBuilder } from "@/features/assessment/components/admin/result-page-builder";
import {
  BuilderStep,
  BuilderStepReset,
  BuilderStepNav,
} from "@/features/admin/components/builder-tab-context";
import { readResultPage } from "@/features/assessment/result-page/blocks";
import { WorkspaceAssessmentActions } from "@/features/workspace/components/workspace-assessment-actions";
import { type BlockType, normalizePages, readPublishedPages } from "@/features/assessment/pages/blocks";
import { Badge } from "@/components/ui/badge";
import { tenantOnly } from "@/lib/tenant/scope";
import { readMetaEvents } from "@/features/assessment/meta-events";
import { metaPublishBlock } from "@/lib/meta/publish-lock";

export const dynamic = "force-dynamic";

export default async function WorkspaceEditAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenantId, impersonating } = await requireWorkspace();
  const { id } = await params;
  const a = await getAssessmentById(id);
  // Ownership gate: the assessment must belong to THIS workspace's tenant.
  if (!a || a.tenantId !== tenantId) notFound();
  if (!(await currentUserCanEdit())) redirect("/w/assessments");
  const promptVersions = (await listPromptVersions(tenantId)).map((v) => ({ id: v.id, label: v.label }));
  // The Meta publish lock, resolved for the button and the warning. A super admin who
  // has entered this workspace is exempt, exactly as the action is, so the screen never
  // shows a rule that would not actually fire.
  const publishBlock = impersonating ? null : await metaPublishBlock(tenantId);

  const initial: AssessmentFormValues = {
    title: a.title,
    slug: a.slug,
    eyebrow: a.eyebrow ?? "",
    subheadline: a.subheadline ?? "",
    qualifiedNote: a.qualifiedNote ?? "",
    description: a.description ?? "",
    buttonColor: a.buttonColor ?? "",
    buttonTextColor: a.buttonTextColor ?? "",
    heatmapCode: a.heatmapCode ?? "",
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
    platformSignup: a.platformSignup,
    introNotice: a.introNotice ?? "",
    startButtonLabel: a.startButtonLabel ?? "",
    resultsButtonLabel: a.resultsButtonLabel ?? "",
    retakePolicy: a.retakePolicy,
    retakeDays: a.retakeDays,
    uniqueIdentifier: a.uniqueIdentifier,
    trainingUrl: a.trainingUrl ?? "",
    targetUrl: a.targetUrl ?? "",
    resultsContinueUrl: a.resultsContinueUrl ?? "",
    resultsContinueLabel: a.resultsContinueLabel ?? "",
    tokenTtlSeconds: a.tokenTtlSeconds ?? undefined,
    vslCountdownSeconds: a.vslCountdownSeconds,
    questionDisplayMode: a.questionDisplayMode,
    autoAdvanceLastScreen: a.autoAdvanceLastScreen,
    resultLinkShowsResult: a.resultLinkShowsResult,
    engine: a.engine,
    aiPromptVersionId: a.aiPromptVersionId ?? "",
    useAiStatement: a.useAiStatement,
    nextStep: a.nextStep,
    paymentUrl: a.paymentUrl ?? "",
    paymentReturnParam: a.paymentReturnParam ?? "",
    paymentHeadline: a.paymentHeadline ?? "",
    paymentButtonLabel: a.paymentButtonLabel ?? "",
    paymentAmount: a.paymentAmount ?? undefined,
    paymentEventName: a.paymentEventName ?? "Purchase121",
    paymentIntroText: a.paymentIntroText ?? "",
    // Merge onto the defaults so a legacy gate (no mode/freeTextRequired) loads as a
    // well-formed DROPDOWN rather than with undefined fields.
    audienceGate: { ...EMPTY_AUDIENCE_GATE, ...((a.audienceGate as unknown as Partial<AudienceGateInput> | null) ?? {}) },
    fireMetaCapi: a.fireMetaCapi,
    // null (never set) reads as every event on, matching what the assessment already does.
    metaEvents: readMetaEvents(a.metaEvents),
  };

  // Other assessments in this workspace - targets for the audience gate onward route.
  const routeTargets = (await listAssessments(tenantOnly(tenantId)))
    .filter((x) => x.id !== a.id)
    .map((x) => ({ id: x.id, title: x.title, slug: x.slug, published: x.status === "PUBLISHED" }));

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
      scoringUnit: q.scoringUnit,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        diagnosisClause: o.diagnosisClause,
        isAssumption: o.isAssumption,
        route: o.route
          ? {
              action: o.route.action,
              targetQuestionId: o.route.targetQuestionId,
              targetCategoryId: o.route.targetCategoryId,
            }
          : null,
      })),
    })),
  }));

  // Conditional-routing (Phase 1) flow context for the per-question routing editor.
  const spine = buildSpine(
    a.categories.map((c) => ({ id: c.id, page: c.page, questions: c.questions.map((q) => ({ id: q.id })) })),
  );
  const questionText = new Map(a.categories.flatMap((c) => c.questions.map((q) => [q.id, q.text] as const)));
  const routingFlow = spine.map((s, index) => {
    const text = questionText.get(s.id) ?? "";
    const short = text.length > 48 ? `${text.slice(0, 48)}…` : text;
    return { id: s.id, index, label: `Q${index + 1} · ${short}` };
  });
  const routingCategories = a.categories
    .map((c) => ({ id: c.id, name: c.name, firstIndex: spine.findIndex((s) => s.categoryId === c.id) }))
    .filter((c) => c.firstIndex >= 0);
  const routingContext = {
    flow: routingFlow,
    categoriesFlow: routingCategories,
    displayMode: a.questionDisplayMode,
  };

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

  const qualParsed = qualificationSchema.safeParse(a.qualification);
  const qualification = qualParsed.success ? qualParsed.data : EMPTY_QUALIFICATION;
  // A stored config that will not parse is dropped by the funnel too, so the editor
  // says so rather than showing a blank gate that looks like one was never built.
  const qualUnreadable = a.qualification != null && !qualParsed.success;
  const disqParsed = disqualifiedContentSchema.safeParse(a.disqualifiedContent);
  const disqualified = disqParsed.success ? disqParsed.data : EMPTY_DISQUALIFIED;

  const assessmentTab = (
    <>
      <AssessmentForm mode="edit" id={a.id} initial={initial} basePath="/w/assessments" promptVersions={promptVersions} assessmentOptions={routeTargets} />

      <BuilderStep step="gate">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Qualification gate</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Asked <strong>before</strong> the assessment, to decide who is worth going further with. An
          answer you mark as disqualifying ends it there: <strong>no lead, no submission, no result</strong>,
          only an optional Meta event so you can stop paying to reach people like them.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Entirely optional. Leave it switched off and everyone goes straight into the assessment.
        </p>
        <QualificationManager
          assessmentId={a.id}
          initialQualification={qualification}
          initialDisqualified={disqualified}
          storedUnreadable={qualUnreadable}
          section="gate"
        />
        <BuilderStepNav step="gate" />
      </section>
      </BuilderStep>

      <BuilderStep step="exit">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">If they don&apos;t qualify</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          The page someone sees when the gate turns them away. They are not a lead and nothing about
          them is stored, so this is the last thing they ever see from this funnel - which makes it
          worth writing. A polite dead end keeps the door open; a blank page reads as a broken site.
        </p>
        <QualificationManager
          assessmentId={a.id}
          initialQualification={qualification}
          initialDisqualified={disqualified}
          storedUnreadable={qualUnreadable}
          section="exit"
        />
        <BuilderStepNav step="exit" />
      </section>
      </BuilderStep>

      <BuilderStep step="after">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Connect your destination page</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Paste a URL above (Destination page), save, then copy this connector into your page.
        </p>
        <ConnectDestination targetUrl={a.targetUrl} endpointBase={env.NEXT_PUBLIC_APP_URL} bandWords={bandWords} />
      </section>
      </BuilderStep>

      <BuilderStep step="categories">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Categories &amp; Questions</h2>
        <CategoriesManager assessmentId={a.id} categories={categories} engine={a.engine} routing={routingContext} />
        <BuilderStepNav step="categories" />
      </section>
      </BuilderStep>

      <BuilderStep step="scoring">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Result Bands</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Bands are matched against the score <strong>percentage (0-100)</strong>,
          so results stay comparable even when optional questions are skipped.
          Ranges must not overlap; cover 0-100 with no gaps.
        </p>
        <ResultBandsManager assessmentId={a.id} bands={bands} />
      </section>
      </BuilderStep>

      <BuilderStep step="scoring">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Category Evaluation Bands</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Per-category evaluation shown on the destination page. Pick a category, a
          level, the <strong>category&apos;s own</strong> score range (its score ÷ its max,
          0-100), and a suggestion. Ranges must not overlap within a category.
        </p>
        <CategoryBandsManager assessmentId={a.id} categories={categoryOptions} bands={categoryBands} />
      </section>
      </BuilderStep>
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

  const resultPageTab = (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">VSL Result Page</h2>
      <p className="text-xs text-[var(--muted-foreground)]">
        The marketing page shown when <em>Next step</em> is <strong>Show results on assess360</strong>
        - eyebrow, headline, the respondent&apos;s AI statement, your VSL video (embed code), buttons
        and YouTube testimonials. Publish to make it live; unpublished falls back to the score cards.
      </p>
      <ResultPageBuilder
        assessmentId={a.id}
        initial={readResultPage(a.resultPage ?? null)}
        initialPublished={!!a.resultPagePublished}
        lastPublishedAt={a.resultPagePublishedAt ? a.resultPagePublishedAt.toISOString() : null}
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
          <WorkspaceAssessmentActions
            id={a.id}
            slug={a.slug}
            title={a.title}
            published={a.status === "PUBLISHED"}
            publishBlock={publishBlock}
          />
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Public URL: <span className="font-mono">/a/{a.slug}</span>
        </p>
      </div>

      {/* The builder's steps. The settings form hides its own blocks per step (they
          share one state object, so a hidden step still saves), and the big managers
          below are wrapped individually. The two page builders keep their own steps at
          the end because each has its own draft and Publish button. */}
      <BuilderStepReset assessmentId={a.id} />

      <div className="flex min-w-0 flex-col gap-8">
        {assessmentTab}
        <BuilderStep step="results">{resultsTab}</BuilderStep>
        <BuilderStep step="resultPage">{resultPageTab}</BuilderStep>
      </div>
    </div>
  );
}

import "server-only";
import { Prisma, RouteAction } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type AssessmentBodyExport, type CategoryExport } from "./schema";
import { buildSpine } from "@/lib/routing/engine";
import { parseDocument, type ParseResult } from "./format";
import { importedGate } from "./gate";
import { normalizeCustomFields } from "@/features/assessment/custom-fields";

export type { ParseResult };

/** Parse + validate an uploaded export (one JSON shape, one CSV shape). */
export const parseImportText = parseDocument;

export async function slugExists(slug: string): Promise<boolean> {
  return (await prisma.assessment.findUnique({ where: { slug }, select: { id: true } })) !== null;
}

/**
 * Generate a unique `…-copy` slug. `taken` lets the caller reserve slugs that
 * are being created in the same import but don't exist in the DB yet, so two
 * same-base entries in one file can't resolve to the same slug.
 */
export async function generateCopySlug(
  base: string,
  taken: Set<string> = new Set(),
): Promise<string> {
  let candidate = `${base}-copy`;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (taken.has(candidate) || (await slugExists(candidate))) {
    n += 1;
    candidate = `${base}-copy-${n}`;
  }
  return candidate;
}

const asJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

/**
 * Build the Prisma create for one portable body. Exported because the Template Library
 * creates an assessment from the SAME shape, and a second copy of this 150-field
 * mapping would be a field-drop waiting to happen - that is exactly how the old,
 * narrower export silently lost thirty-four settings.
 *
 * Callers may override what they need on the returned object (the template importer
 * forces `fireMetaCapi` off, for instance); everything else is carried faithfully.
 */
export function assessmentCreateData(
  body: AssessmentBodyExport,
  finalSlug: string,
  userId: string | null,
  tenantId: string | null = null,
): Prisma.AssessmentCreateInput {
  const nextStep = body.nextStep ?? "DESTINATION";
  // An older file has no mode, and those assessments asked for everything on one
  // screen - so absent means ALL_AT_ONCE rather than a default anybody has to guess.
  //
  // 🔴 SPLIT needs an email to exist at all: it is the step that writes the lead. A
  // file asking for SPLIT without one would import a funnel that runs three screens and
  // produces nothing, so it lands as ALL_AT_ONCE instead of as a broken funnel.
  const leadMode =
    body.leadCaptureMode === "SPLIT" && body.collectEmail ? ("SPLIT" as const) : ("ALL_AT_ONCE" as const);
  const splitRequired = leadMode === "SPLIT";
  return {
    title: body.title,
    slug: finalSlug,
    description: body.description ?? null,
    coverImageUrl: body.coverImageUrl ?? null,
    estimatedMinutes: body.estimatedMinutes ?? null,
    thankYouMessage: body.thankYouMessage ?? null,
    collectFirstName: body.collectFirstName,
    // 🔴 SPLIT makes every collected field mandatory, and an import writes straight to
    // the row rather than going through the save action that normally applies that
    // rule. Without this an imported split funnel would render screens whose fields
    // can be skipped, which produces a half-captured lead and no way to reach them.
    firstNameRequired: splitRequired ? body.collectFirstName : body.firstNameRequired,
    collectLastName: body.collectLastName,
    lastNameRequired: splitRequired ? body.collectLastName : body.lastNameRequired,
    collectEmail: body.collectEmail,
    emailRequired: splitRequired ? body.collectEmail : body.emailRequired,
    collectMobile: body.collectMobile,
    mobileRequired: splitRequired ? body.collectMobile : body.mobileRequired,
    collectProfession: body.collectProfession,
    professionRequired: splitRequired ? body.collectProfession : body.professionRequired,
    // v2 fields (default when importing an older/CSV file that omits them).
    engine: body.engine ?? "GENERIC",
    engineConfig: asJson(body.engineConfig),
    eyebrow: body.eyebrow ?? null,
    subheadline: body.subheadline ?? null,
    qualifiedNote: body.qualifiedNote ?? null,
    buttonColor: body.buttonColor ?? null,
    buttonTextColor: body.buttonTextColor ?? null,
    heatmapCode: body.heatmapCode ?? null,
    firstNameLabel: body.firstNameLabel ?? null,
    lastNameLabel: body.lastNameLabel ?? null,
    emailLabel: body.emailLabel ?? null,
    mobileLabel: body.mobileLabel ?? null,
    professionLabel: body.professionLabel ?? null,
    professionPlaceholder: body.professionPlaceholder ?? null,
    professionOptions: body.professionOptions ?? [],
    leadCaptureAfter: body.leadCaptureAfter ?? false,
    leadCaptureMode: leadMode,
    preResultHeading: body.preResultHeading ?? null,
    preResultSubtext: body.preResultSubtext ?? null,
    // Normalized, never stored as the file wrote them: a foreign file can name a field
    // type this app cannot render, and an unrenderable field reaches the owner as a
    // crashed editor rather than as a complaint about the import.
    preResultFields: asJson(normalizeCustomFields(body.preResultFields)),
    optinFields: asJson(normalizeCustomFields(body.optinFields)),
    introNotice: body.introNotice ?? null,
    startButtonLabel: body.startButtonLabel ?? null,
    resultsButtonLabel: body.resultsButtonLabel ?? null,
    useAiStatement: body.useAiStatement ?? true,
    nextStep,
    paidMode: nextStep === "PAYMENT",
    questionDisplayMode: body.questionDisplayMode ?? "ALL",
    ...(body.vslCountdownSeconds != null ? { vslCountdownSeconds: body.vslCountdownSeconds } : {}),
    status: "DRAFT",

    // The configuration the old format dropped. Spread conditionally so a file written by
    // the narrower export still imports and simply leaves these at their column defaults,
    // rather than overwriting them with nulls.
    ...(body.qualification != null ? { qualification: body.qualification as Prisma.InputJsonValue } : {}),
    ...(body.disqualifiedContent != null ? { disqualifiedContent: body.disqualifiedContent as Prisma.InputJsonValue } : {}),
    ...(body.audienceGate != null ? { audienceGate: importedGate(body.audienceGate) as Prisma.InputJsonValue } : {}),
    ...(body.resultPage != null ? { resultPage: body.resultPage as Prisma.InputJsonValue } : {}),
    ...(body.resultPagePublished != null ? { resultPagePublished: body.resultPagePublished as Prisma.InputJsonValue } : {}),
    ...(body.publishedPages != null ? { publishedPages: body.publishedPages as Prisma.InputJsonValue } : {}),
    ...(body.metaEvents != null ? { metaEvents: body.metaEvents as Prisma.InputJsonValue } : {}),
    ...(body.fireMetaCapi != null ? { fireMetaCapi: body.fireMetaCapi } : {}),
    ...(body.platformSignup != null ? { platformSignup: body.platformSignup } : {}),
    ...(body.retakePolicy ? { retakePolicy: body.retakePolicy } : {}),
    ...(body.retakeDays != null ? { retakeDays: body.retakeDays } : {}),
    ...(body.uniqueIdentifier ? { uniqueIdentifier: body.uniqueIdentifier } : {}),
    ...(body.trainingUrl != null ? { trainingUrl: body.trainingUrl } : {}),
    ...(body.targetUrl != null ? { targetUrl: body.targetUrl } : {}),
    ...(body.tokenTtlSeconds != null ? { tokenTtlSeconds: body.tokenTtlSeconds } : {}),
    ...(body.resultsContinueUrl != null ? { resultsContinueUrl: body.resultsContinueUrl } : {}),
    ...(body.resultsContinueLabel != null ? { resultsContinueLabel: body.resultsContinueLabel } : {}),
    ...(body.paymentUrl != null ? { paymentUrl: body.paymentUrl } : {}),
    ...(body.paymentReturnParam != null ? { paymentReturnParam: body.paymentReturnParam } : {}),
    ...(body.paymentHeadline != null ? { paymentHeadline: body.paymentHeadline } : {}),
    ...(body.paymentButtonLabel != null ? { paymentButtonLabel: body.paymentButtonLabel } : {}),
    ...(body.paymentAmount != null ? { paymentAmount: body.paymentAmount } : {}),
    ...(body.paymentEventName ? { paymentEventName: body.paymentEventName } : {}),
    ...(body.paymentIntroText != null ? { paymentIntroText: body.paymentIntroText } : {}),

    ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
    ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
    categories: {
      create: body.categories.map((c, ci) => ({
        name: c.name,
        description: c.description ?? null,
        displayOrder: ci,
        page: c.page ?? 1,
        // Absent on files written before the format carried them, which is why this is
        // optional rather than required: an old export must still import, it just has
        // no interpretation text to restore.
        bands: {
          create: (c.bands ?? []).map((b, bi) => ({
            label: b.label,
            meaning: b.meaning ?? null,
            minScore: b.minScore,
            maxScore: b.maxScore,
            displayOrder: bi,
          })),
        },
        questions: {
          create: c.questions.map((q, qi) => ({
            text: q.text,
            type: q.type,
            // A typed answer scores nothing, so it lands with weight 0 whatever the
            // file says - the same rule the builder applies when you create one.
            weight: q.type === "FREE_TEXT" ? 0 : q.weight,
            required: q.required,
            displayOrder: qi,
            scoringRole: q.scoringRole ?? null,
            scoringUnit: q.scoringUnit ?? null,
            options: {
              create: q.options.map((o, oi) => ({
                label: o.label,
                value: o.value,
                displayOrder: oi,
                diagnosisClause: o.diagnosisClause ?? null,
                isAssumption: o.isAssumption ?? false,
              })),
            },
          })),
        },
      })),
    },
    resultBands: {
      create: body.resultBands.map((b, bi) => ({
        level: b.level,
        title: b.title,
        description: b.description ?? null,
        minScore: b.minScore,
        maxScore: b.maxScore,
        displayOrder: bi,
      })),
    },
  };
}

/**
 * Write the imported assessment's conditional routing.
 *
 * WHY THIS IS A SECOND PASS. A route points at another question or category, and those
 * rows do not have ids until the nested create has run. So the create carries the
 * questions and this carries the rules, keyed by the authored `key` fields, resolved
 * against the rows that were just written.
 *
 * WHY POSITION, NOT NAME, MATCHES THE BODY TO THE ROWS. The create wrote categories and
 * questions in array order with displayOrder set from that order, so reading them back
 * in displayOrder gives the same sequence the file declared. Matching on text would
 * break on the duplicate question text the format explicitly allows.
 *
 * 🔴 IT THROWS. A key that resolves to nothing, or a target that is not strictly
 * forward, means the document is wrong - and because this runs inside the import
 * transaction, throwing rolls the whole assessment back. The alternative, importing the
 * questions and silently dropping the branches, is the one outcome nobody can debug:
 * every screen looks right and a tenth of the respondents see the wrong follow-ups.
 */
export async function applyImportedRoutes(
  tx: ImportTx,
  assessmentId: string,
  body: AssessmentBodyExport,
): Promise<void> {
  const hasAny = body.categories.some((c) =>
    c.questions.some((q) => q.defaultRoute != null || q.options.some((o) => o.route != null)),
  );
  if (!hasAny) return;

  const created = await tx.category.findMany({
    where: { assessmentId },
    orderBy: { displayOrder: "asc" },
    select: {
      id: true,
      page: true,
      questions: {
        orderBy: { displayOrder: "asc" },
        select: { id: true, options: { orderBy: { displayOrder: "asc" }, select: { id: true } } },
      },
    },
  });

  // key -> created id. The fallback keys mirror the ones export synthesises, so a file
  // that routes without naming its own keys still resolves.
  const catIdByKey = new Map<string, string>();
  const qIdByKey = new Map<string, string>();
  body.categories.forEach((c, ci) => {
    const row = created[ci];
    if (!row) return;
    catIdByKey.set(c.key ?? `c${ci + 1}`, row.id);
    c.questions.forEach((q, qi) => {
      const qRow = row.questions[qi];
      if (!qRow) return;
      qIdByKey.set(q.key ?? `c${ci + 1}q${qi + 1}`, qRow.id);
    });
  });

  // The traversal spine of the rows as written, so "strictly forward" means here what
  // it means everywhere else - the same page-1-then-page-2 order the runner paginates in.
  const spine = buildSpine(
    created.map((c) => ({ id: c.id, page: c.page, questions: c.questions.map((q) => ({ id: q.id })) })),
  );
  const indexOfQuestion = new Map(spine.map((sq, i) => [sq.id, i] as const));
  const firstIndexOfCategory = new Map<string, number>();
  spine.forEach((sq, i) => {
    if (!firstIndexOfCategory.has(sq.categoryId)) firstIndexOfCategory.set(sq.categoryId, i);
  });

  /** Resolve one authored rule against the created rows, or throw saying which one. */
  const resolve = (
    rule: NonNullable<CategoryExport["questions"][number]["defaultRoute"]>,
    fromIndex: number,
    where: string,
  ): { action: RouteAction; targetQuestionId: string | null; targetCategoryId: string | null } | null => {
    if (rule.action === "NEXT") return null;
    if (rule.action === "SKIP_TO_END") {
      return { action: RouteAction.SKIP_TO_END, targetQuestionId: null, targetCategoryId: null };
    }
    if (rule.action === "JUMP_TO_QUESTION") {
      const id = rule.targetQuestionKey ? qIdByKey.get(rule.targetQuestionKey) : undefined;
      if (!id) throw new Error(`${where}: no question with key "${rule.targetQuestionKey ?? ""}".`);
      const ti = indexOfQuestion.get(id);
      if (ti === undefined || ti <= fromIndex) {
        throw new Error(`${where}: "${rule.targetQuestionKey}" is not a LATER question.`);
      }
      return { action: RouteAction.JUMP_TO_QUESTION, targetQuestionId: id, targetCategoryId: null };
    }
    const id = rule.targetCategoryKey ? catIdByKey.get(rule.targetCategoryKey) : undefined;
    if (!id) throw new Error(`${where}: no category with key "${rule.targetCategoryKey ?? ""}".`);
    const ci = firstIndexOfCategory.get(id);
    if (ci === undefined || ci <= fromIndex) {
      throw new Error(`${where}: "${rule.targetCategoryKey}" is not a LATER category.`);
    }
    return { action: RouteAction.JUMP_TO_CATEGORY, targetQuestionId: null, targetCategoryId: id };
  };

  const optionRules: {
    questionId: string;
    optionId: string;
    action: RouteAction;
    targetQuestionId: string | null;
    targetCategoryId: string | null;
  }[] = [];
  const defaults: { id: string; data: Record<string, unknown> }[] = [];

  body.categories.forEach((c, ci) => {
    const row = created[ci];
    if (!row) return;
    c.questions.forEach((q, qi) => {
      const qRow = row.questions[qi];
      if (!qRow) return;
      const fromIndex = indexOfQuestion.get(qRow.id) ?? -1;
      const label = `Question "${q.text.slice(0, 40)}"`;

      q.options.forEach((o, oi) => {
        if (!o.route) return;
        const oRow = qRow.options[oi];
        if (!oRow) return;
        const r = resolve(o.route, fromIndex, `${label}, answer "${o.label.slice(0, 30)}"`);
        if (r) optionRules.push({ questionId: qRow.id, optionId: oRow.id, ...r });
      });

      if (q.defaultRoute) {
        const r = resolve(q.defaultRoute, fromIndex, `${label}, default route`);
        if (r) {
          defaults.push({
            id: qRow.id,
            data: {
              defaultRouteAction: r.action,
              defaultTargetQuestionId: r.targetQuestionId,
              defaultTargetCategoryId: r.targetCategoryId,
            },
          });
        }
      }
    });
  });

  if (optionRules.length > 0) await tx.questionRoute.createMany({ data: optionRules });
  for (const d of defaults) {
    await tx.question.update({ where: { id: d.id }, data: d.data });
  }
}

export interface ImportItem {
  body: AssessmentBodyExport;
  finalSlug: string;
  replace: boolean;
}

/**
 * Import all assessments in ONE transaction - any failure rolls everything back
 * (no partial imports). For replace, the existing slug is deleted first (child
 * rows cascade via FK). A generous timeout covers large "Export All" payloads,
 * whose deeply-nested creates would otherwise exceed Prisma's 5s default.
 */
export interface ImportOutcome {
  count: number;
  /** Slugs that could not be replaced and were imported under a new name instead. */
  renamed: Array<{ from: string; to: string }>;
}

export async function performImportAll(
  items: ImportItem[],
  userId: string | null,
  tenantId: string | null = null,
): Promise<ImportOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const renamed: ImportOutcome["renamed"] = [];
      for (const item of items) {
        let slug = item.finalSlug;

        if (item.replace) {
          // Scope the replace to the acting tenant when importing into a workspace,
          // so a tenant can never delete another tenant's (or the platform's) slug.
          const removed = await tx.assessment.deleteMany({
            where: { slug, ...(tenantId ? { tenantId } : {}) },
          });

          // Deleted nothing, but the slug may still be taken by a row this caller is not
          // allowed to replace: another tenant's, or an unowned row left behind by an
          // import that predates owner stamping. Previously the create then hit the unique
          // constraint and the whole import died with "a slug collided during import",
          // which told the operator nothing about what to do next.
          //
          // So: import it under a free slug and SAY SO, rather than refusing. A renamed
          // import is recoverable in ten seconds; a failed one with an opaque message is
          // a support conversation.
          if (removed.count === 0) {
            const blocker = await tx.assessment.findUnique({ where: { slug }, select: { id: true } });
            if (blocker) {
              let n = 2;
              let candidate = `${slug}-${n}`;
              // Bounded so a pathological case cannot spin inside a transaction.
              while (n < 100 && (await tx.assessment.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
                n += 1;
                candidate = `${slug}-${n}`;
              }
              renamed.push({ from: slug, to: candidate });
              slug = candidate;
            }
          }
        }

        const createdRow = await tx.assessment.create({
          data: assessmentCreateData(item.body, slug, userId, tenantId),
          select: { id: true, slug: true, title: true },
        });
        await createResultDocsForImport(tx, {
          assessmentId: createdRow.id,
          assessmentSlug: createdRow.slug,
          assessmentTitle: createdRow.title,
          tenantId,
          body: item.body,
        });
        await applyImportedRoutes(tx, createdRow.id, item.body);
      }
      return { count: items.length, renamed };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

/**
 * The transaction client as THIS prisma instance hands it over.
 *
 * Not `Prisma.TransactionClient`: the shared client is `$extends`-ed
 * (lib/db/prisma.ts), so its transaction callback receives the extended client, which
 * is a different type and is rejected on assignment. Derived from the real
 * `$transaction` signature, the same way scripts/adopt-assessment.ts does it, so it
 * cannot drift from whatever the extensions make it.
 */
type ImportTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Give an imported assessment its own result pages, in the library.
 *
 * The transfer shape carries page CONTENT (resultPage, resultPagePublished,
 * publishedPages) inside the body, deliberately: a template has to be self-contained,
 * so exporting a reference to a library row would import as a dangling link into a
 * workspace that has never seen it.
 *
 * So the content arrives by value and is turned into docs HERE, bound 1:1 to the new
 * assessment. That also fixes a quirk this inherits: an imported funnel used to arrive
 * with a published results page and no draft rows at all, which rendered fine and could
 * not be edited.
 *
 * The assessment's own columns are left exactly as the import wrote them, so what the
 * public renders is unchanged by this - the docs are the editable copy of the same
 * content.
 */
export async function createResultDocsForImport(
  tx: ImportTx,
  args: {
    assessmentId: string;
    assessmentSlug: string;
    assessmentTitle: string;
    tenantId: string | null;
    body: AssessmentBodyExport;
  },
): Promise<void> {
  const { body } = args;

  const freeSlug = async (base: string): Promise<string> => {
    let candidate = base;
    for (let n = 2; n < 100; n++) {
      const taken = await tx.resultPageDoc.findFirst({
        where: { tenantId: args.tenantId, slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
      candidate = `${base}-${n}`;
    }
    return `${base}-${Date.now()}`;
  };

  // The results page. Its draft rows are rebuilt from the published snapshot, which is
  // the only shape the transfer format carries.
  const publishedPages = Array.isArray(body.publishedPages)
    ? (body.publishedPages as Array<{ order?: number; title?: string | null; blocks?: Array<{ type?: string; order?: number; config?: unknown }> }>)
    : [];
  if (publishedPages.length > 0) {
    const doc = await tx.resultPageDoc.create({
      data: {
        kind: "RESULTS",
        title: `${args.assessmentTitle} - results page`.slice(0, 160),
        slug: await freeSlug(`${args.assessmentSlug}-results`),
        tenantId: args.tenantId,
        published: body.publishedPages as Prisma.InputJsonValue,
        publishedAt: new Date(),
        pages: {
          create: publishedPages.map((p, i) => ({
            order: p.order ?? i,
            title: p.title ?? null,
            blocks: {
              create: (p.blocks ?? []).map((b, j) => ({
                type: String(b.type ?? "text"),
                order: b.order ?? j,
                config: (b.config ?? {}) as Prisma.InputJsonValue,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    await tx.assessment.update({ where: { id: args.assessmentId }, data: { resultsDocId: doc.id } });
  }

  // The VSL page. Draft falls back to the published blob, so a page that was exported
  // live and never re-drafted opens with its own content.
  const vslDraft = body.resultPage ?? body.resultPagePublished ?? null;
  if (vslDraft != null) {
    const doc = await tx.resultPageDoc.create({
      data: {
        kind: "VSL",
        title: `${args.assessmentTitle} - VSL page`.slice(0, 160),
        slug: await freeSlug(`${args.assessmentSlug}-vsl`),
        tenantId: args.tenantId,
        draft: vslDraft as Prisma.InputJsonValue,
        ...(body.resultPagePublished != null
          ? { published: body.resultPagePublished as Prisma.InputJsonValue, publishedAt: new Date() }
          : {}),
      },
      select: { id: true },
    });
    await tx.assessment.update({ where: { id: args.assessmentId }, data: { vslDocId: doc.id } });
  }
}

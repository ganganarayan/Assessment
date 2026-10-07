import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tenantCanonicalOrigin } from "@/lib/seo/site";
import { getPublishedAssessmentBySlug, getSlugById } from "@/features/assessment/data";
import { pickAttribution } from "@/lib/attribution";
import {
  AssessmentRunner,
  type PublicAssessment,
} from "@/features/assessment/components/public/assessment-runner";
import { readPublishedPages } from "@/features/assessment/pages/blocks";
import { resolveAudienceCanonical } from "@/lib/settings/config";
import { cache } from "react";
import { resolvePlan } from "@/lib/billing/entitlements";
import { hasFeature } from "@/lib/billing/plans";
import { AssessBadge } from "@/features/assessment/components/public/assess-badge";
import { FunnelPaused } from "@/features/assessment/components/public/funnel-paused";
import {
  type PreResultField,
  qualificationSchema,
  disqualifiedContentSchema,
  EMPTY_DISQUALIFIED,
} from "@/features/assessment/schemas";

export const dynamic = "force-dynamic";

/**
 * The owning tenant's plan, deduped per request. This runs on the public funnel - an ad
 * landing page - so it is the one plan lookup on a genuinely hot path. React's cache()
 * collapses repeat calls within a single render without caching ACROSS requests, which
 * matters: a tenant who upgrades must lose the badge, and an unparked tenant must serve
 * the funnel again, on the very next page view rather than whenever a TTL expires.
 *
 * This resolves the WHOLE plan rather than one feature, because the page now asks two
 * questions of it (is the tenant parked, and is the badge removed). `tenantCan` would
 * have been two calls and two queries for answers that arrive in one row.
 */
const planFor = cache(async (tenantId: string | null) => resolvePlan(tenantId));

/**
 * Metadata for a public funnel. Three jobs:
 *
 * 1. A PAUSED funnel must not be indexed. The pause is temporary by definition, so
 *    letting a crawler cache "isn't accepting responses" as the funnel's description
 *    outlives the pause and costs the tenant traffic after they pay.
 *
 * 2. A CANONICAL on the tenant's own origin. The slug lookup below is global, not
 *    host-scoped, so this exact funnel also answers on the platform domain and on every
 *    other tenant domain - the same document at N addresses. The canonical names the
 *    tenant's own domain as the real one, which is where their ads point anyway.
 *
 * 3. A REAL title. Inheriting the root default used to mean every funnel on earth was
 *    titled "Assessment"; it now inherits the tenant's name, which is better and still
 *    not the page. The assessment's own title and description are the page.
 *
 * All lookups are request-deduped (unstable_cache / React cache), so the page render
 * below does not repeat them.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // A preview URL is an unpublished draft shown to its owner. If one ever escapes into a
  // crawler's queue it must not be indexed, and it is not worth a plan lookup either.
  if (sp.preview === "1") return { robots: { index: false, follow: false } };

  const a = await getPublishedAssessmentBySlug(slug);
  if (!a) return {};

  const plan = await planFor(a.tenantId);
  if (plan.parked) return { robots: { index: false, follow: false } };

  const origin = await tenantCanonicalOrigin(a.tenantId);
  return {
    // A bare string, so the root layout's template appends the owner's name: on a tenant
    // host that reads "Clinic Growth Audit · Acme", which is theirs, not ours.
    title: a.title,
    ...(a.description ? { description: a.description } : {}),
    ...(origin ? { alternates: { canonical: `${origin}/a/${slug}` } } : {}),
  };
}

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
  // A preview is someone checking their own funnel, usually seconds after saving it, so
  // it reads the live row rather than the cached funnel payload. Ad traffic keeps the
  // cache.
  const a = await getPublishedAssessmentBySlug(slug, { fresh: preview });
  if (!a) notFound();

  // PARKED → paused page, before any of the work below. Checked here rather than deeper
  // in the runner so a parked funnel costs one plan lookup instead of building the whole
  // public payload (audience gate targets, published pages, every category and option)
  // for a page nobody can answer.
  //
  // `preview` still goes through: the owner previewing their own funnel while parked
  // needs to see what they are paying to turn back on, and the preview path stores
  // nothing either way.
  const plan = await planFor(a.tenantId);
  if (plan.parked && !preview) return <FunnelPaused title={a.title} />;

  // Audience gate (Phase 2): each role either continues in THIS assessment
  // (redirectSlug null) or redirects to another assessment. The option is shown
  // regardless of the target's publish status (the builder flags drafts); only a
  // role whose target id no longer exists is dropped.
  const gateRaw = (a.audienceGate ?? null) as {
    mode?: string;
    label?: string;
    placeholder?: string;
    freeTextRequired?: boolean;
    roles?: { id: string; label: string; target?: string }[];
  } | null;
  let audienceGate: PublicAssessment["audienceGate"] = null;
  if (gateRaw && gateRaw.mode === "FREETEXT") {
    // Free-text audience field: no options/routing - just capture, with live
    // suggestions from the tenant's canonical list.
    const suggestions = await resolveAudienceCanonical(a.tenantId);
    audienceGate = {
      mode: "FREETEXT",
      label: gateRaw.label?.trim() || null,
      placeholder: gateRaw.placeholder?.trim() || null,
      required: gateRaw.freeTextRequired === true,
      suggestions,
      options: [],
    };
  } else if (gateRaw && Array.isArray(gateRaw.roles) && gateRaw.roles.length > 0) {
    const options: { key: string; label: string; redirectSlug: string | null }[] = [];
    for (const r of gateRaw.roles) {
      if (!r?.label) continue;
      if (!r.target) {
        options.push({ key: r.id, label: r.label, redirectSlug: null }); // continue here
        continue;
      }
      const t = await getSlugById(r.target);
      if (t) options.push({ key: r.id, label: r.label, redirectSlug: t.slug });
    }
    if (options.length > 0) {
      audienceGate = {
        mode: "DROPDOWN",
        label: gateRaw.label?.trim() || null,
        placeholder: gateRaw.placeholder?.trim() || null,
        required: false,
        suggestions: [],
        options,
      };
    }
  }

  const assessment: PublicAssessment = {
    slug: a.slug,
    title: a.title,
    eyebrow: a.eyebrow,
    subheadline: a.subheadline,
    qualifiedNote: a.qualifiedNote,
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
    platformSignup: a.platformSignup,
    vslCountdownSeconds: a.vslCountdownSeconds,
    questionDisplayMode: a.questionDisplayMode,
    autoAdvanceLastScreen: a.autoAdvanceLastScreen,
    paymentHeadline: a.paymentHeadline,
    paymentButtonLabel: a.paymentButtonLabel,
    paymentIntroText: a.paymentIntroText,
    // Audience gate (Phase 2).
    audienceGate,
    // Qualification gate (Page 1): only pass it when enabled with questions.
    qualification: (() => {
      const p = qualificationSchema.safeParse(a.qualification);
      return p.success && p.data.enabled && p.data.questions.length > 0 ? p.data : null;
    })(),
    disqualified: (() => {
      // Parse against {} when unset so defaults (incl. fireDisqualifiedEvent: true)
      // apply - otherwise enabling the gate without saving the exit page would
      // silently never fire the GateDisqualified exclusion event.
      const p = disqualifiedContentSchema.safeParse(a.disqualifiedContent ?? {});
      return p.success ? p.data : EMPTY_DISQUALIFIED;
    })(),
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

  // Badge on Gate, gone from Signal up. Resolved SERVER-side from the owning tenant's
  // plan: a client-side check would be advisory, and the one thing this must not be is
  // removable without paying.
  const brandingRemoved = hasFeature(plan.limits, "brandingRemoved");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <AssessmentRunner assessment={assessment} attribution={attribution} preview={preview} />
      <AssessBadge show={!brandingRemoved} />
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PagesBuilder } from "@/features/assessment/components/admin/pages-builder";
import { ResultPageBuilder } from "@/features/assessment/components/admin/result-page-builder";
import { normalizePages } from "@/features/assessment/pages/blocks";
import {
  getScopedDoc,
  boundAssessmentOf,
  editorContextFor,
  resultsDraftOf,
  resultsPublishedOf,
  vslDraftOf,
} from "@/features/result-pages/data";
import { DocIdentity } from "@/features/result-pages/components/doc-identity";
import { KIND_LABEL, KIND_BLURB } from "@/features/result-pages/docs";

/**
 * One result page, edited on its own screen.
 *
 * The same shell serves /admin and /w, which is the point: a page is a tenant-owned
 * record, and the only difference between the two surfaces is which workspace is
 * acting. getScopedDoc is the gate - a doc outside the caller's scope is a 404 here,
 * not a hidden button.
 *
 * Both builders are reused unchanged; they were already self-contained, they simply
 * take a docId now instead of an assessmentId.
 */
export async function DocEditor({
  docId,
  basePath,
  assessmentBase,
}: {
  docId: string;
  /** Where the library lives for this surface. */
  basePath: string;
  /** Where an assessment is edited on this surface, e.g. "/w/assessments". */
  assessmentBase: string;
}) {
  const doc = await getScopedDoc(docId);
  if (!doc) notFound();

  const bound = boundAssessmentOf(doc);
  const ctx = await editorContextFor(bound?.id ?? null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={basePath} className="text-sm underline">
          ← Result pages
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
          <Badge variant="muted">{KIND_LABEL[doc.kind]}</Badge>
          {doc.published ? <Badge variant="success">Published</Badge> : <Badge variant="outline">Draft</Badge>}
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">{KIND_BLURB[doc.kind]}</p>

        {/* Who this page is live for, said plainly. An unbound page can be edited and
            published all day and will show to nobody, which is a reasonable thing to
            do deliberately and a terrible thing to discover by accident. */}
        {bound ? (
          <p className="text-sm">
            Used by{" "}
            <Link href={`${assessmentBase}/${bound.id}`} className="font-medium underline">
              {bound.title}
            </Link>
            . Publishing here updates that funnel, and no other.
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            Not bound to a funnel yet, so nothing you publish here is live anywhere. Bind it on an assessment&apos;s{" "}
            <strong>{doc.kind === "VSL" ? "13. VSL result page" : "12. Results page"}</strong> step.
          </p>
        )}

        {doc.sourceSlug ? (
          <p className="text-xs text-[var(--muted-foreground)]">Copied from {doc.sourceSlug}</p>
        ) : null}

        <DocIdentity id={doc.id} title={doc.title} slug={doc.slug} />
      </div>

      {doc.kind === "RESULTS" ? (
        <ResultsEditor docId={doc.id} published={doc.published} bandTitles={ctx.bandTitles} publishedAt={doc.publishedAt} />
      ) : (
        <section className="flex flex-col gap-3">
          <ResultPageBuilder
            docId={doc.id}
            initial={vslDraftOf(doc)}
            initialPublished={doc.published != null}
            lastPublishedAt={doc.publishedAt ? doc.publishedAt.toISOString() : null}
            hasExitRoutes={ctx.hasExitRoutes}
          />
          {!bound ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Blocks addressed to an exit route are offered only once this page is bound to a funnel that has one.
            </p>
          ) : null}
        </section>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Need the same page on another funnel? Clone it in the{" "}
        <Link href={basePath} className={buttonVariants({ size: "sm", variant: "ghost" })}>
          library
        </Link>{" "}
        - one page is never shared by two funnels, so a copy is what keeps your live pages independent.
      </p>
    </div>
  );
}

/** The relational kind needs its draft rows and a draft-vs-published comparison. */
async function ResultsEditor({
  docId,
  published,
  bandTitles,
  publishedAt,
}: {
  docId: string;
  published: unknown;
  bandTitles: Record<string, string>;
  publishedAt: Date | null;
}) {
  const draft = await resultsDraftOf(docId);
  const live = resultsPublishedOf({ published });
  return (
    <PagesBuilder
      docId={docId}
      initialPages={draft}
      bandTitles={bandTitles}
      initialDirty={normalizePages(draft) !== normalizePages(live)}
      initialPublished={live.length > 0}
      lastPublishedAt={publishedAt ? publishedAt.toISOString() : null}
    />
  );
}

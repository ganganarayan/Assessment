"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, tenantScope, configTenantOf } from "@/lib/tenant/acting";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { readResultPage, EMPTY_RESULT_PAGE } from "@/features/assessment/result-page/blocks";
import { readPublishedPages } from "@/features/assessment/pages/blocks";
import { isDocKind, copyTitle, copySlugCandidates, slugifyDocTitle, KIND_LABEL } from "@/features/result-pages/docs";
import { mirrorPublished, clearMirror, uniqueDocSlug } from "@/features/result-pages/mirror";
import { isPlatformOwned, shelfDocForImport } from "@/features/result-pages/data";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The result-page library: create, clone, rename, delete, bind, unbind.
 *
 * Only async functions are exported from this module - a "use server" file that
 * exports a type or a constant typechecks clean and then fails the Railway build, so
 * the vocabulary lives in features/result-pages/docs.ts and the mirroring in mirror.ts.
 *
 * Every mutation resolves the acting scope, refuses view-only staff, and matches the
 * row against that scope. The 1:1 binding itself is enforced by the UNIQUE columns on
 * the assessment, so the checks here are for a clear message, not for safety.
 */

function refreshLibrary(): void {
  revalidatePath("/admin/result-pages");
  revalidatePath("/w/result-pages");
}

/** A blank page of either kind, named by the owner. */
export async function createDoc(kind: string, title: string): Promise<ActionResult<{ id: string }>> {
  if (!isDocKind(kind)) return { ok: false, error: "Unknown page type." };
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const clean = title.trim();
  if (!clean) return { ok: false, error: "Give the page a name." };
  const tenantId = configTenantOf(scope);
  const slug = await uniqueDocSlug(tenantId, clean);

  const doc = await prisma.resultPageDoc.create({
    data: {
      kind,
      title: clean.slice(0, 160),
      slug,
      tenantId,
      // A RESULTS page opens onto one empty page to put blocks on; a VSL page opens
      // onto an empty block list. Each is what its builder expects to find.
      ...(kind === "RESULTS"
        ? { pages: { create: [{ order: 0, title: "Results page" }] } }
        : { draft: EMPTY_RESULT_PAGE as unknown as Prisma.InputJsonValue }),
    },
    select: { id: true },
  });
  refreshLibrary();
  return { ok: true, data: { id: doc.id } };
}

/**
 * Clone a page, bound to nothing.
 *
 * This is how the same page reaches a second funnel: the binding is 1:1, so there is
 * no sharing to offer. There is a copy with its own name, slug and Publish button,
 * which is what makes an edit here unable to reword a page that live traffic is
 * landing on somewhere else.
 *
 * The clone starts UNPUBLISHED even from a live source: it is bound to no funnel, so
 * there is nothing for a snapshot to be live on, and the next Publish is a decision
 * for whoever has just changed the video link.
 */
export async function cloneDoc(id: string): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const src = await prisma.resultPageDoc.findFirst({
    where: { id, ...tenantScope(scope) },
    select: {
      kind: true,
      title: true,
      slug: true,
      draft: true,
      published: true,
      pages: { orderBy: { order: "asc" }, include: { blocks: { orderBy: { order: "asc" } } } },
    },
  });
  if (!src) return { ok: false, error: "That page is not in this workspace." };

  const tenantId = configTenantOf(scope);
  const candidate = copySlugCandidates(src.slug);
  let slug = candidate(1);
  for (let n = 2; n < 500; n++) {
    const taken = await prisma.resultPageDoc.findFirst({ where: { tenantId, slug }, select: { id: true } });
    if (!taken) break;
    slug = candidate(n);
  }

  // Both kinds fall back to the published snapshot when the draft is empty: a page
  // that was published and never re-drafted would otherwise clone blank, which reads
  // as data loss and is the one thing a clone must never do.
  const draftPages =
    src.pages.length > 0
      ? src.pages.map((p) => ({
          order: p.order,
          title: p.title,
          blocks: p.blocks.map((b) => ({ type: b.type, order: b.order, config: b.config })),
        }))
      : readPublishedPages(src.published ?? null).map((p) => ({
          order: p.order,
          title: p.title,
          blocks: p.blocks.map((b) => ({ type: b.type as string, order: b.order, config: b.config })),
        }));

  const copy = await prisma.resultPageDoc.create({
    data: {
      kind: src.kind,
      title: copyTitle(src.title).slice(0, 160),
      slug,
      tenantId,
      sourceSlug: src.slug,
      ...(src.kind === "VSL"
        ? { draft: readResultPage(src.draft ?? src.published ?? null) as unknown as Prisma.InputJsonValue }
        : {
            pages: {
              create: draftPages.map((p) => ({
                order: p.order,
                title: p.title,
                blocks: {
                  create: p.blocks.map((b) => ({
                    type: b.type,
                    order: b.order,
                    config: (b.config ?? {}) as Prisma.InputJsonValue,
                  })),
                },
              })),
            },
          }),
    },
    select: { id: true },
  });
  refreshLibrary();
  return { ok: true, data: { id: copy.id } };
}

/** Rename. The slug is left alone: it is the identifier a clone chain reads back. */
export async function renameDoc(id: string, title: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Give the page a name." };
  const found = await prisma.resultPageDoc.findFirst({ where: { id, ...tenantScope(scope) }, select: { id: true } });
  if (!found) return { ok: false, error: "That page is not in this workspace." };
  await prisma.resultPageDoc.update({ where: { id }, data: { title: clean.slice(0, 160) } });
  refreshLibrary();
  return { ok: true };
}

/** Change the slug. Refused when the workspace already has that one. */
export async function setDocSlug(id: string, slug: string): Promise<ActionResult<{ slug: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const found = await prisma.resultPageDoc.findFirst({
    where: { id, ...tenantScope(scope) },
    select: { id: true, tenantId: true },
  });
  if (!found) return { ok: false, error: "That page is not in this workspace." };
  const clean = slugifyDocTitle(slug);
  const taken = await prisma.resultPageDoc.findFirst({
    where: { tenantId: found.tenantId, slug: clean, NOT: { id } },
    select: { id: true },
  });
  if (taken) return { ok: false, error: `This workspace already has a page with the slug ${clean}.` };
  await prisma.resultPageDoc.update({ where: { id }, data: { slug: clean } });
  refreshLibrary();
  return { ok: true, data: { slug: clean } };
}

/**
 * Delete, refused while the page is bound.
 *
 * Deleting a bound page would clear a funnel's live result page as a side effect of a
 * click on a library screen. Unbind it on the assessment first, where the consequence
 * is visible.
 */
export async function deleteDoc(id: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const doc = await prisma.resultPageDoc.findFirst({
    where: { id, ...tenantScope(scope) },
    select: {
      kind: true,
      resultsOf: { select: { title: true } },
      vslOf: { select: { title: true } },
    },
  });
  if (!doc) return { ok: false, error: "That page is not in this workspace." };
  const bound = doc.resultsOf ?? doc.vslOf;
  if (bound) {
    return {
      ok: false,
      error: `This page is in use by ${bound.title}. Unbind it there first, on the ${KIND_LABEL[doc.kind]} step, then delete it.`,
    };
  }
  await prisma.resultPageDoc.delete({ where: { id } });
  refreshLibrary();
  return { ok: true };
}

/**
 * Bind a free page to an assessment, 1:1.
 *
 * A page that is already published goes live on this funnel at once, because that is
 * what binding a published page means. Its snapshot is mirrored here rather than
 * waiting for a Publish nobody would think to click.
 */
export async function bindDoc(assessmentId: string, kind: string, docId: string): Promise<ActionResult> {
  if (!isDocKind(kind)) return { ok: false, error: "Unknown page type." };
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "That assessment is not in this workspace." };

  const doc = await prisma.resultPageDoc.findFirst({
    where: { id: docId, ...tenantScope(scope) },
    select: {
      id: true,
      kind: true,
      title: true,
      resultsOf: { select: { id: true, title: true } },
      vslOf: { select: { id: true, title: true } },
    },
  });
  if (!doc) return { ok: false, error: "That page is not in this workspace." };
  if (doc.kind !== kind) {
    return { ok: false, error: `That page is a ${KIND_LABEL[doc.kind]}, not a ${KIND_LABEL[kind]}.` };
  }

  const already = doc.resultsOf ?? doc.vslOf;
  if (already && already.id !== assessmentId) {
    return {
      ok: false,
      error: `${doc.title} is already used by ${already.title}. Clone it to use the same page on this funnel.`,
    };
  }

  // Whatever this assessment had for this kind is released back into the library, and
  // its live snapshot is replaced by the new page's - or cleared, when the new page
  // has never been published.
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: kind === "RESULTS" ? { resultsDocId: docId } : { vslDocId: docId },
  });
  await mirrorPublished(docId);
  refreshLibrary();
  revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath(`/w/assessments/${assessmentId}`);
  return { ok: true };
}

/**
 * Unbind: the funnel keeps no page of that kind, and the page returns to the library
 * unchanged.
 *
 * The live snapshot is cleared with it, so the funnel falls back to what it did before
 * any page was built - the score cards on the token link, the destination redirect in
 * the funnel proper. Leaving the snapshot behind would be a live page editable from
 * nowhere, which is the state this whole feature exists to remove.
 */
export async function unbindDoc(assessmentId: string, kind: string): Promise<ActionResult> {
  if (!isDocKind(kind)) return { ok: false, error: "Unknown page type." };
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "That assessment is not in this workspace." };

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: kind === "RESULTS" ? { resultsDocId: null } : { vslDocId: null },
  });
  await clearMirror(assessmentId, kind);
  refreshLibrary();
  revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath(`/w/assessments/${assessmentId}`);
  return { ok: true };
}

/**
 * Create a page from the assessment's own step and bind it in one go - the path for
 * somebody who is not shopping the library, only building this one funnel.
 */
export async function createAndBindDoc(
  assessmentId: string,
  kind: string,
  title: string,
): Promise<ActionResult<{ id: string }>> {
  const created = await createDoc(kind, title);
  if (!created.ok) return created;
  const docId = created.data?.id;
  if (!docId) return { ok: false, error: "The page was not created." };
  const bound = await bindDoc(assessmentId, kind, docId);
  if (!bound.ok) return bound;
  return { ok: true, data: { id: docId } };
}

/**
 * Put a page on the platform shelf, or take it off.
 *
 * Three conditions, each one a different way to get this wrong:
 *  - the caller is the platform owner. Listing a page puts it on the first screen of
 *    every workspace on the install, which is closer to shipping than to editing.
 *  - the page is PLATFORM-owned. A tenant's page is theirs, and "publishing" it would
 *    hand their copy, their headline and their video to every other customer.
 *  - the page is bound to nothing. A template is a starting point; a page serving a
 *    live funnel is not one, and importing copies of it would multiply somebody's
 *    booking inbox across the install.
 */
export async function setDocShelf(id: string, listed: boolean): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper) return { ok: false, error: "Only the platform owner can publish a page to the shelf." };

  const doc = await prisma.resultPageDoc.findUnique({
    where: { id },
    select: {
      tenantId: true,
      title: true,
      resultsOf: { select: { title: true } },
      vslOf: { select: { title: true } },
    },
  });
  if (!doc) return { ok: false, error: "That page no longer exists." };
  if (!isPlatformOwned(doc.tenantId)) {
    return { ok: false, error: "Only a page in the platform's own library can go on the shelf." };
  }
  const bound = doc.resultsOf ?? doc.vslOf;
  if (listed && bound) {
    return {
      ok: false,
      error: `${doc.title} is in use by ${bound.title}. Clone it and publish the copy, so the shelf never hands out a page that is serving a funnel.`,
    };
  }

  await prisma.resultPageDoc.update({ where: { id }, data: { shelfListed: listed } });
  refreshLibrary();
  return { ok: true };
}

/** The shelf row's own copy: which heading it sits under, what it says, its order. */
export async function setDocShelfMeta(
  id: string,
  meta: { category?: string; summary?: string; order?: number },
): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper) return { ok: false, error: "Only the platform owner can edit the shelf." };

  const doc = await prisma.resultPageDoc.findUnique({ where: { id }, select: { tenantId: true } });
  if (!doc) return { ok: false, error: "That page no longer exists." };
  if (!isPlatformOwned(doc.tenantId)) {
    return { ok: false, error: "Only a page in the platform's own library can go on the shelf." };
  }

  await prisma.resultPageDoc.update({
    where: { id },
    data: {
      ...(meta.category !== undefined ? { shelfCategory: meta.category.trim().slice(0, 60) || null } : {}),
      ...(meta.summary !== undefined ? { shelfSummary: meta.summary.trim().slice(0, 300) || null } : {}),
      ...(meta.order !== undefined ? { shelfOrder: Math.max(0, Math.min(9999, Math.trunc(meta.order))) } : {}),
    },
  });
  refreshLibrary();
  return { ok: true };
}

/**
 * Import a shelf page into the acting workspace.
 *
 * It COPIES, always. Nothing binds a workspace's funnel to a platform row: the binding
 * is 1:1, so crossing workspaces with it would mean the owner's edit rewriting a
 * customer's live page. What a tenant gets is their own page, with their own slug,
 * unpublished and bound to nothing - a draft they can rename, edit and bind.
 *
 * The shelf row's own copy (category, summary) is NOT carried: that text describes the
 * shelf listing, not the page, and leaving it on the import would put the owner's
 * marketing words inside somebody's workspace.
 */
export async function importShelfDoc(id: string): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  // The owner may import an unlisted page: reviewing one before it goes on the shelf
  // means being able to run it, which is the same rule the template reviewer follows.
  const src = await shelfDocForImport(id, scope.isSuper);
  if (!src) return { ok: false, error: "That page is not on the shelf." };

  const tenantId = configTenantOf(scope);
  const slug = await uniqueDocSlug(tenantId, src.slug);

  const draftPages =
    src.pages.length > 0
      ? src.pages.map((p) => ({
          order: p.order,
          title: p.title,
          blocks: p.blocks.map((b) => ({ type: b.type, order: b.order, config: b.config })),
        }))
      : readPublishedPages(src.published ?? null).map((p) => ({
          order: p.order,
          title: p.title,
          blocks: p.blocks.map((b) => ({ type: b.type as string, order: b.order, config: b.config })),
        }));

  const copy = await prisma.resultPageDoc.create({
    data: {
      kind: src.kind,
      title: src.title.slice(0, 160),
      slug,
      tenantId,
      sourceSlug: src.slug,
      ...(src.kind === "VSL"
        ? { draft: readResultPage(src.draft ?? src.published ?? null) as unknown as Prisma.InputJsonValue }
        : {
            pages: {
              create: draftPages.map((p) => ({
                order: p.order,
                title: p.title,
                blocks: {
                  create: p.blocks.map((b) => ({
                    type: b.type,
                    order: b.order,
                    config: (b.config ?? {}) as Prisma.InputJsonValue,
                  })),
                },
              })),
            },
          }),
    },
    select: { id: true },
  });
  refreshLibrary();
  return { ok: true, data: { id: copy.id } };
}

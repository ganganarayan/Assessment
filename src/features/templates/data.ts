import "server-only";
import { prisma } from "@/lib/db/prisma";
import { parseTemplateBody, categoryRank, type TemplateShapeId } from "@/features/templates/schema";

/**
 * Reads for the Template Library.
 *
 * There is ONE visibility rule and it is derived from the row, never stored as a mode:
 *
 *   master library (what a tenant imports from) = ownerTenantId IS NULL
 *                                                 AND published
 *                                                 AND reviewStatus = APPROVED
 *   private (only its own workspace)            = ownerTenantId = that tenant
 *   their own contributions                     = contributorTenantId = that tenant,
 *                                                 whatever state it is in
 *   super-admin console                         = everything, pending first
 *
 * A workspace sees its OWN contributions at every stage, including rejected ones. The
 * first version did not, and the effect was that pressing Contribute made the template
 * disappear: no row, no status, no way to withdraw it, and nothing to tell them the
 * reviewer had replied.
 *
 * Deriving it is what stops a contribution from reaching other tenants by accident: a
 * row cannot be "published" into the library while it is still PENDING, because the
 * query asks for both and a mode flag would have been one value to get wrong.
 */

export interface TemplateListItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string | null;
  shape: TemplateShapeId;
  published: boolean;
  displayOrder: number;
  builtin: boolean;
  /** True for a row this workspace owns or contributed - "theirs" on screen. */
  mine: boolean;
  /** Whether THIS workspace may remove it: a private template of their own, or a
   *  contribution nobody has ruled on yet. An approved contribution is in the library
   *  and withdrawing it would empty the screen of every workspace reading it. */
  canRemove: boolean;
  /** Whether THIS workspace may import it. A contribution that is still pending, or
   *  that was rejected, belongs to nobody: it is not in the library and it is not in
   *  their workspace either, so the button would only ever produce an error. Computed
   *  here, with the row in hand, rather than reconstructed from three flags in JSX. */
  importable: boolean;
  hasAiPrompt: boolean;
  gateQuestions: number;
  questions: number;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  contributorName: string | null;
  contributorTenantId: string | null;
  submittedAt: string | null;
}

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  category: true,
  summary: true,
  shape: true,
  published: true,
  displayOrder: true,
  builtin: true,
  ownerTenantId: true,
  aiInstructions: true,
  body: true,
  reviewStatus: true,
  reviewNote: true,
  contributorName: true,
  contributorTenantId: true,
  submittedAt: true,
} as const;

type RawRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string | null;
  shape: string;
  published: boolean;
  displayOrder: number;
  builtin: boolean;
  ownerTenantId: string | null;
  aiInstructions: string | null;
  body: unknown;
  reviewStatus: string;
  reviewNote: string | null;
  contributorName: string | null;
  contributorTenantId: string | null;
  submittedAt: Date | null;
};

/**
 * How many questions a template holds, read out of the body rather than stored.
 *
 * Counting at read time means a template edited in git can never disagree with the
 * number shown next to it, which a denormalized column would do the first time someone
 * edited the JSON and forgot.
 */
function countOf(body: unknown): { gateQuestions: number; questions: number } {
  const parsed = parseTemplateBody(body);
  if (!parsed.success) return { gateQuestions: 0, questions: 0 };
  const b = parsed.data;
  const questions = b.categories.reduce((n, c) => n + c.questions.length, 0);
  // The gate lives in the `qualification` JSON blob, whose shape belongs to the gate
  // feature. Only the count is read here, defensively: an unexpected shape shows 0
  // rather than throwing inside a list query.
  const q = b.qualification as { questions?: unknown[] } | null | undefined;
  const gateQuestions = Array.isArray(q?.questions) ? q.questions.length : 0;
  return { gateQuestions, questions };
}

function toItem(r: RawRow, askingTenantId: string | null): TemplateListItem {
  const { gateQuestions, questions } = countOf(r.body);
  const owns = !!r.ownerTenantId && r.ownerTenantId === askingTenantId;
  const contributed = !!r.contributorTenantId && r.contributorTenantId === askingTenantId;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    summary: r.summary,
    shape: r.shape as TemplateShapeId,
    published: r.published,
    displayOrder: r.displayOrder,
    builtin: r.builtin,
    mine: owns || contributed,
    canRemove: owns || (contributed && r.reviewStatus === "PENDING"),
    importable: owns || (!r.ownerTenantId && r.published && r.reviewStatus === "APPROVED"),
    hasAiPrompt: !!r.aiInstructions?.trim(),
    gateQuestions,
    questions,
    reviewStatus: r.reviewStatus as TemplateListItem["reviewStatus"],
    reviewNote: r.reviewNote,
    contributorName: r.contributorName,
    contributorTenantId: r.contributorTenantId,
    submittedAt: r.submittedAt?.toISOString() ?? null,
  };
}

function byCategoryThenOrder(a: TemplateListItem, b: TemplateListItem): number {
  const ca = categoryRank(a.category);
  const cb = categoryRank(b.category);
  if (ca !== cb) return ca - cb;
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  return a.title.localeCompare(b.title);
}

/**
 * The library a workspace may import from: the published master rows, plus that
 * workspace's OWN private templates (which are never published and belong to nobody
 * else). A tenant's private rows come first - they saved them, they are looking for them.
 */
export async function listTemplatesForTenant(tenantId: string): Promise<TemplateListItem[]> {
  const rows = (await prisma.template.findMany({
    where: {
      OR: [
        { ownerTenantId: null, published: true, reviewStatus: "APPROVED" },
        { ownerTenantId: tenantId },
        { contributorTenantId: tenantId },
      ],
    },
    select: LIST_SELECT,
  })) as RawRow[];
  const items = rows.map((r) => toItem(r, tenantId));
  const mine = items.filter((i) => i.mine).sort(byCategoryThenOrder);
  const library = items.filter((i) => !i.mine).sort(byCategoryThenOrder);
  return [...mine, ...library];
}

/** Everything, for the super-admin console. Pending contributions first: they are the
 *  only rows on this screen that are waiting on a decision. */
export async function listAllTemplates(): Promise<TemplateListItem[]> {
  const rows = (await prisma.template.findMany({ select: LIST_SELECT })) as RawRow[];
  const items = rows.map((r) => toItem(r, null));
  const pending = items.filter((i) => i.reviewStatus === "PENDING");
  const rest = items.filter((i) => i.reviewStatus !== "PENDING");
  pending.sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  return [...pending, ...rest.sort(byCategoryThenOrder)];
}

/**
 * The library as the PLATFORM OWNER sees it on their own dashboard: every template,
 * published or not, all importable.
 *
 * Deliberately different from what a tenant gets, and the difference is the point. A
 * tenant sees what is on the shelf; the owner has to see what is NOT on it yet, because
 * an unpublished template is precisely the one still waiting to be read. A list that
 * hid them would hide the entire review queue from the screen the owner lands on.
 *
 * `importable` is true for everything except a declined contribution, so the owner can
 * run one to review it - which is the only honest way to judge a funnel - without that
 * loosening anything for anyone else: the import action grants it only to a super admin.
 */
export async function listTemplatesForOwner(ownerTenantId: string): Promise<TemplateListItem[]> {
  const rows = (await prisma.template.findMany({ select: LIST_SELECT })) as RawRow[];
  const items = rows
    .map((r) => toItem(r, ownerTenantId))
    .map((i) => ({ ...i, importable: i.reviewStatus !== "REJECTED" }));
  const pending = items.filter((i) => i.reviewStatus === "PENDING");
  const rest = items.filter((i) => i.reviewStatus !== "PENDING");
  pending.sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  return [...pending, ...rest.sort(byCategoryThenOrder)];
}

/** Group a list for rendering, in the order the categories are authored in. */
export function groupByCategory(items: TemplateListItem[]): Array<{ category: string; items: TemplateListItem[] }> {
  const out: Array<{ category: string; items: TemplateListItem[] }> = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.category === it.category) last.items.push(it);
    else out.push({ category: it.category, items: [it] });
  }
  return out;
}

/** How many templates are on the shelf right now - for the dashboard section, which
 *  must not render an empty panel before any are published. */
export async function countTemplatesForTenant(tenantId: string): Promise<number> {
  return prisma.template.count({
    where: {
      OR: [
        { ownerTenantId: null, published: true, reviewStatus: "APPROVED" },
        { ownerTenantId: tenantId },
        { contributorTenantId: tenantId },
      ],
    },
  });
}

import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Who a run is actually writing to.
 *
 * A workflow used to be about a Contact and only a Contact, so the runner read
 * run.contact directly and every field came from one row. There are now two kinds of
 * subject and they are genuinely different people:
 *
 *   LEAD    a Contact. Somebody the workspace is selling to.
 *   TENANT  a workspace, reached through whoever owns it. This is the product writing
 *           to its own customer, nudging them through setting the thing up.
 *
 * 🔴 ONE RESOLVER, NOT TWO BRANCHES IN THE RUNNER. The runner has a suppression check, a
 * staleness check, a tag step and a send, and each one needed the subject. Branching at
 * every one of them is four chances to handle the tenant case in three places and forget
 * the fourth - which would show up as a workspace owner being messaged after they asked
 * not to be. Resolved once, at the top, into one shape.
 */

export interface WorkflowRecipient {
  /**
   * The contact id, or null on a TENANT run. Every send is logged against it, so the
   * log column is nullable for the same reason.
   */
  contactId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  profession: string | null;
  optOutToken: string;
  /** Already said no to marketing. The runner stops the run rather than skipping a step. */
  optedOut: boolean;
  /**
   * 🟡 Tags belong to contacts. A TAG step on a tenant-nurture workflow has nothing to
   * tag, and is skipped with a reason rather than failing the run: the rest of the
   * sequence is still worth sending.
   */
  taggable: boolean;
  /** For the log and for anything the owner reads. */
  label: string;
}

/**
 * The subject of one run, or null when there is nobody to reach.
 *
 * Null is a real outcome, not an error: a workspace whose only login was deleted has no
 * owner to write to, and the run should stop saying so rather than retry forever.
 */
export async function resolveRecipient(run: {
  contactId: string | null;
  subjectTenantId: string | null;
}): Promise<WorkflowRecipient | null> {
  if (run.contactId) {
    const c = await prisma.contact.findUnique({ where: { id: run.contactId } });
    if (!c) return null;
    return {
      contactId: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      mobile: c.mobile,
      profession: c.profession,
      optOutToken: c.optOutToken,
      optedOut: c.marketingOptOutAt != null,
      taggable: true,
      label: c.email ?? c.mobile ?? c.id,
    };
  }

  if (!run.subjectTenantId) return null;

  // The workspace's owner: the earliest login that is not a staff member, which is the
  // same rule the trial lifecycle sender uses. Staff are excluded on purpose - a nudge
  // to finish setting the product up belongs to whoever decided to buy it.
  const owner = await prisma.user.findFirst({
    where: { tenantId: run.subjectTenantId, deletedAt: null, staffPermission: null },
    orderBy: { createdAt: "asc" },
    select: { name: true, email: true, whatsapp: true },
  });
  if (!owner?.email) return null;

  const profile = await prisma.lifecycleProfile
    .findUnique({
      where: { tenantId: run.subjectTenantId },
      select: { optOutToken: true, status: true },
    })
    .catch(() => null);

  const [first, ...rest] = (owner.name ?? "").trim().split(/\s+/);
  return {
    contactId: null,
    firstName: first || null,
    lastName: rest.length > 0 ? rest.join(" ") : null,
    email: owner.email,
    mobile: owner.whatsapp ?? null,
    profession: null,
    // 🔴 The unsubscribe link has to be THEIRS, and the trial lifecycle already issues
    // one per workspace. Reusing it means a customer who unsubscribes from one platform
    // sequence is out of all of them, which is what they meant. A fresh token here would
    // quietly give them a second list to leave.
    optOutToken: profile?.optOutToken ?? "",
    optedOut: profile?.status === "UNSUBSCRIBED",
    taggable: false,
    label: owner.email,
  };
}

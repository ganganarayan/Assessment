import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { formatIST } from "@/lib/date";
import { contactTenantOf } from "@/lib/contacts/upsert";
import { describeSource, isUnconsentedSource } from "@/lib/contacts/sources";

/**
 * Reading the contacts list.
 *
 * The filters here are the same ones a broadcast audience will need, which is why they
 * live in a data module rather than inside a page: "everybody who answered this
 * assessment, tagged hot, who has not opted out" has to mean exactly one thing whether
 * it is being counted on screen or messaged at midnight.
 */

export interface ContactFilters {
  /** Matches name, email or mobile. */
  q?: string;
  tagId?: string;
  assessmentId?: string;
  /** "in" = messageable, "out" = unsubscribed, undefined = everybody. */
  dnd?: "in" | "out";
  page?: number;
}

export const CONTACTS_PAGE_SIZE = 50;

export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  /** DD-MM-YYYY HH:MM, IST, formatted here so no client locale can reorder it. */
  createdAt: string;
  optedOut: boolean;
  optOutSource: string | null;
  consented: boolean;
  tags: { id: string; name: string; color: string | null }[];
  submissionCount: number;
  /** Where they came from, in words. */
  sourceLabel: string;
  /**
   * 🔴 True for somebody who arrived off a connected phone and has opted in to
   * nothing. Shown as a badge, because otherwise an imported address book is
   * indistinguishable from a list of leads and the owner cannot understand why a
   * broadcast skipped half their contacts.
   */
  imported: boolean;
  /** When a real WhatsApp message last passed, DD-MM-YYYY HH:MM IST. */
  lastMessageAt: string | null;
  /** Their custom values, keyed by placeholder name. Missing key = empty. */
  values: Record<string, string>;
}

export interface ContactsView {
  rows: ContactRow[];
  total: number;
  page: number;
  pages: number;
  tags: { id: string; name: string; color: string | null; count: number }[];
  /**
   * The custom values this workspace keeps, whether or not anybody has one filled in.
   * The registry rather than the values: this is the list the editor renders a box for,
   * and a field nobody has filled in yet is exactly the one somebody needs to see.
   */
  fields: { id: string; key: string; label: string; holdWhenEmpty: boolean; system: boolean }[];
  assessments: { id: string; title: string }[];
}

function whereFor(tenantId: string, f: ContactFilters): Prisma.ContactWhereInput {
  const q = (f.q ?? "").trim();
  return {
    tenantId,
    ...(f.dnd === "out" ? { marketingOptOutAt: { not: null } } : {}),
    ...(f.dnd === "in" ? { marketingOptOutAt: null } : {}),
    ...(f.tagId ? { tags: { some: { tagId: f.tagId } } } : {}),
    // The assessment filter reaches through the runs: a contact is "in" an assessment
    // when they have a submission on it. Gate entries are deliberately not counted -
    // somebody who passed a gate and never opted in is a different audience, and
    // conflating them is how a broadcast reaches people who never gave a number.
    ...(f.assessmentId ? { submissions: { some: { assessmentId: f.assessmentId } } } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { mobile: { contains: q.replace(/[^\d]/g, "") || q } },
          ],
        }
      : {}),
  };
}

export async function listContacts(
  scopeTenantId: string | null,
  f: ContactFilters = {},
): Promise<ContactsView> {
  const tenantId = contactTenantOf(scopeTenantId);
  const where = whereFor(tenantId, f);
  const page = Math.max(1, f.page ?? 1);

  const [total, rows, tags, fields, assessments] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * CONTACTS_PAGE_SIZE,
      take: CONTACTS_PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        mobile: true,
        createdAt: true,
        marketingOptOutAt: true,
        optOutSource: true,
        consentAt: true,
        source: true,
        lastMessageAt: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        fieldValues: { select: { value: true, field: { select: { key: true } } } },
        _count: { select: { submissions: true } },
      },
    }),
    prisma.tag.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, _count: { select: { contacts: true } } },
    }),
    prisma.contactField.findMany({
      where: { tenantId },
      // System fields last: the owner's own values are what they came to look at, and
      // the meeting link the app fills in is not something they can do anything about.
      orderBy: [{ system: "asc" }, { label: "asc" }],
      select: { id: true, key: true, label: true, holdWhenEmpty: true, system: true },
    }),
    prisma.assessment.findMany({
      where: tenantId === "platform" ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return {
    rows: rows.map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "(no name)",
      email: c.email,
      mobile: c.mobile,
      createdAt: formatIST(c.createdAt),
      optedOut: c.marketingOptOutAt != null,
      optOutSource: c.optOutSource,
      consented: c.consentAt != null,
      tags: c.tags.map((t) => t.tag),
      submissionCount: c._count.submissions,
      sourceLabel: describeSource(c.source),
      imported: isUnconsentedSource(c.source),
      lastMessageAt: c.lastMessageAt ? formatIST(c.lastMessageAt) : null,
      values: Object.fromEntries(c.fieldValues.map((v) => [v.field.key, v.value])),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)),
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.contacts })),
    fields,
    assessments,
  };
}

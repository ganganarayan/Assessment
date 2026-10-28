import { prisma } from "@/lib/db/prisma";
import { SYSTEM_FIELDS, type ResolvedValues } from "@/lib/contacts/field-names";

/** One import for a server caller; the pure half lives in field-names.ts. */
export * from "@/lib/contacts/field-names";

/**
 * CUSTOM VALUES: the rules, in one place.
 *
 * A workspace declares the values it keeps about a person (ContactField) and fills them
 * in per contact (ContactFieldValue). A message writes one as {{key}}, through the same
 * substitution every other placeholder goes through.
 *
 * Not `server-only`: the Railway crons run outside Next, where that package does not
 * resolve, and a queue drain absolutely must resolve the same values the app would.
 */

/**
 * Make sure a system field exists for this workspace, and return its id.
 *
 * Idempotent: called every time the Zoom step runs, which is the only honest moment to
 * create it - that is when the workspace first has a link to keep.
 */
export async function ensureSystemField(tenantId: string, key: string): Promise<string | null> {
  const spec = SYSTEM_FIELDS.find((f) => f.key === key);
  if (!spec) return null;
  try {
    const row = await prisma.contactField.upsert({
      where: { tenantId_key: { tenantId, key } },
      // 🟡 The label and the hold rule are NOT rewritten on every call. The owner is
      // allowed to decide that an empty meeting link should not hold a message, and a
      // helper that reset their choice every time the step ran would be a setting that
      // mysteriously undoes itself.
      update: { system: true },
      create: { tenantId, key, label: spec.label, holdWhenEmpty: spec.holdWhenEmpty, system: true },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error("[fields] system field failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Write one value for one contact. Absent is empty, so a blank value is deleted. */
export async function setContactValue(
  tenantId: string,
  contactId: string,
  key: string,
  value: string | null,
): Promise<void> {
  try {
    const field = await prisma.contactField.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { id: true },
    });
    if (!field) return;
    const v = (value ?? "").trim();
    if (!v) {
      await prisma.contactFieldValue.deleteMany({ where: { contactId, fieldId: field.id } });
      return;
    }
    await prisma.contactFieldValue.upsert({
      where: { contactId_fieldId: { contactId, fieldId: field.id } },
      update: { value: v },
      create: { contactId, fieldId: field.id, value: v },
    });
  } catch (e) {
    console.error("[fields] value not written:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * What this contact's custom values are, and which keys hold a message when empty.
 *
 * One query for the fields and one for the values, both small, and a failure resolves
 * to nothing rather than throwing: the message paths are best-effort by design, and a
 * custom value that could not be read must not take down a send that does not use one.
 */
export interface FieldRow {
  id: string;
  key: string;
  holdWhenEmpty: boolean;
}

/**
 * This workspace's registry, read once.
 *
 * Separate from resolveContactValues so a SENDER IN A LOOP reads it once rather than
 * once per recipient. A broadcast to five thousand people would otherwise run five
 * thousand identical queries for a list that cannot change mid-send.
 */
export async function loadContactFields(tenantId: string): Promise<FieldRow[]> {
  try {
    return await prisma.contactField.findMany({
      where: { tenantId },
      select: { id: true, key: true, holdWhenEmpty: true },
    });
  } catch (e) {
    console.error("[fields] registry not read:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function resolveContactValues(
  tenantId: string,
  contactId: string | null,
  /** Pass the registry when the caller already has it, as a send loop does. */
  known?: FieldRow[],
): Promise<ResolvedValues> {
  try {
    const fields = known ?? (await loadContactFields(tenantId));
    if (fields.length === 0) return { values: {}, holdKeys: [] };
    const holdKeys = fields.filter((f) => f.holdWhenEmpty).map((f) => f.key);

    // 🔴 No contact is not an error, it is an EMPTY SET. A sequence about a workspace
    // has no person to hold values for, so every custom value in it is empty and the
    // hold rule below decides what that means. The alternative - a special case that
    // skips the rule when there is no contact - would send exactly the message with a
    // hole in it that the rule exists to stop.
    if (!contactId) return { values: {}, holdKeys };

    const rows = await prisma.contactFieldValue.findMany({
      where: { contactId, fieldId: { in: fields.map((f) => f.id) } },
      select: { fieldId: true, value: true },
    });
    const byId = new Map(fields.map((f) => [f.id, f.key]));
    const values: Record<string, string> = {};
    for (const r of rows) {
      const key = byId.get(r.fieldId);
      if (key && r.value.trim()) values[key] = r.value;
    }
    return { values, holdKeys };
  } catch (e) {
    console.error("[fields] values not resolved:", e instanceof Error ? e.message : String(e));
    return { values: {}, holdKeys: [] };
  }
}


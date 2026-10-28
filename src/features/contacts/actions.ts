"use server";

import { revalidatePath } from "next/cache";
import { fireWorkflowTrigger } from "@/lib/workflows/enqueue";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { featureDenied } from "@/lib/features/release";
import { contactTenantOf } from "@/lib/contacts/upsert";
import { unsuppressContact } from "@/lib/contacts/dnd";
import { keyFromLabel, keyProblem, setContactValue } from "@/lib/contacts/fields";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The admin half of contacts: tags, and the do-not-disturb flag.
 *
 * Every one of these resolves the ACTING scope and then checks that the row being
 * touched belongs to it. The scope alone is not enough: an id arrives from the
 * browser, and "this user may edit contacts" is a different question from "this user
 * may edit THIS contact".
 */

/**
 * The acting scope as a contact OWNER, or the refusal to return.
 *
 * An explicit ok flag rather than probing for a property: a union discriminated by
 * "does this key exist" reads fine and narrows badly, and the compiler was right to
 * complain that the error branch might be carrying nothing.
 */
type OwnerScope = { ok: true; tenantId: string } | { ok: false; result: ActionResult };

async function ownerScope(): Promise<OwnerScope> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return { ok: false, result: denied };
  if (!scope.tenantId && !scope.isSuper) {
    return { ok: false, result: { ok: false, error: "No workspace." } };
  }
  const tenantId = contactTenantOf(scope.tenantId);
  // Held back from customers until released. The admin half only - contacts keep being
  // CREATED behind the scenes and unsubscribe keeps working, because consent is never
  // something a release switch gets to hold back.
  const held = await featureDenied("contacts", tenantId);
  if (held) return { ok: false, result: held };
  return { ok: true, tenantId };
}

function refresh() {
  revalidatePath("/admin/contacts");
  revalidatePath("/w/contacts");
}

export async function createTag(
  name: string,
  color: string | null = null,
): Promise<ActionResult<{ id: string; name: string }>> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Give the tag a name." };
  try {
    const t = await prisma.tag.create({
      data: { tenantId: s.tenantId, name: clean, color },
      select: { id: true, name: true },
    });
    refresh();
    return { ok: true, data: t };
  } catch {
    // 🟡 The unique key is (tenant, name), so the only realistic failure is a duplicate -
    // and typing a name that already exists MEANS that tag, it is not a mistake. Handing
    // back the existing row lets a picker create-or-choose in one action instead of
    // showing a red box and asking somebody to go and find it.
    const existing = await prisma.tag.findFirst({
      where: { tenantId: s.tenantId, name: clean },
      select: { id: true, name: true },
    });
    if (existing) return { ok: true, data: existing };
    return { ok: false, error: "That tag could not be created." };
  }
}

export async function renameTag(tagId: string, name: string): Promise<ActionResult> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Give the tag a name." };
  const owned = await prisma.tag.findFirst({ where: { id: tagId, tenantId: s.tenantId }, select: { id: true } });
  if (!owned) return { ok: false, error: "That tag is not in this workspace." };
  try {
    await prisma.tag.update({ where: { id: tagId }, data: { name: clean } });
  } catch {
    return { ok: false, error: "You already have a tag with that name." };
  }
  refresh();
  return { ok: true };
}

/**
 * Delete a tag.
 *
 * The join rows go with it and the contacts do not, which is the only sane reading of
 * deleting a label. Worth knowing before clicking it, so the UI asks.
 */
export async function deleteTag(tagId: string): Promise<ActionResult> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const owned = await prisma.tag.findFirst({ where: { id: tagId, tenantId: s.tenantId }, select: { id: true } });
  if (!owned) return { ok: false, error: "That tag is not in this workspace." };
  await prisma.tag.delete({ where: { id: tagId } });
  refresh();
  return { ok: true };
}

/** Put a tag on a contact, or take it off. Both sides verified against the scope. */
export async function setContactTag(
  contactId: string,
  tagId: string,
  on: boolean,
): Promise<ActionResult> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const [contact, tag] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, tenantId: s.tenantId }, select: { id: true } }),
    prisma.tag.findFirst({ where: { id: tagId, tenantId: s.tenantId }, select: { id: true } }),
  ]);
  if (!contact || !tag) return { ok: false, error: "That contact or tag is not in this workspace." };

  if (on) {
    // Already-tagged is a no-op rather than an error: the UI is a toggle, and a double
    // click should settle on the state you asked for.
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      update: {},
      create: { contactId, tagId },
    });
  } else {
    await prisma.contactTag.deleteMany({ where: { contactId, tagId } });
  }
  // The other half of handing somebody between sequences. Fired after the write so a
  // workflow reading the tags sees the one that just changed.
  await fireWorkflowTrigger(on ? "TAG_ADDED" : "TAG_REMOVED", {
    tenantId: s.tenantId,
    contactId,
    tagId,
  });
  refresh();
  return { ok: true };
}

/**
 * Turn do-not-disturb on or off by hand.
 *
 * 🟡 Turning it back ON for somebody is a real decision, not an undo: they asked to be
 * left alone, and only a direct request from them should reverse it. The UI says so;
 * the action allows it because the owner sometimes has that request in writing.
 */
export async function setContactDnd(contactId: string, optOut: boolean): Promise<ActionResult> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const owned = await prisma.contact.findFirst({
    where: { id: contactId, tenantId: s.tenantId },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "That contact is not in this workspace." };

  if (optOut) {
    await prisma.contact.update({
      where: { id: contactId },
      data: { marketingOptOutAt: new Date(), optOutSource: "ADMIN" },
    });
    // 🔴 Nothing started here may MESSAGE them - the runner stops any run whose subject
    // is suppressed, and that check happens per step. This exists for the rest: taking
    // tags off, telling a CRM, tidying up after somebody who left.
    await fireWorkflowTrigger("CONTACT_UNSUBSCRIBED", { tenantId: s.tenantId, contactId });
  } else {
    await unsuppressContact(contactId);
  }
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------- custom values --- */

/**
 * Declare a value this workspace keeps about a person.
 *
 * One box on screen: the name is what people read and the key is derived from it, so
 * {{planName}} comes from typing "Plan name". The key is checked against the built-in
 * placeholders here rather than at send time, because a field called firstName would
 * not fail - it would silently win or lose depending on which path a message took.
 */
export async function createContactField(label: string): Promise<ActionResult<{ id: string; key: string }>> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const clean = label.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Give the value a name." };
  const key = keyFromLabel(clean);
  const problem = keyProblem(key);
  if (problem) return { ok: false, error: problem };

  const existing = await prisma.contactField.findUnique({
    where: { tenantId_key: { tenantId: s.tenantId, key } },
    select: { id: true, key: true },
  });
  // The same name twice MEANS that field, the way it does for a tag. Handing back the
  // existing row beats a red box that asks somebody to go and look for it.
  if (existing) return { ok: true, data: existing };

  const made = await prisma.contactField.create({
    data: { tenantId: s.tenantId, key, label: clean },
    select: { id: true, key: true },
  });
  refresh();
  return { ok: true, data: made };
}

/** Should a message naming this value be held when the person has not got one? */
export async function setContactFieldHold(id: string, hold: boolean): Promise<ActionResult> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const { count } = await prisma.contactField.updateMany({
    where: { id, tenantId: s.tenantId },
    data: { holdWhenEmpty: hold },
  });
  if (!count) return { ok: false, error: "That value is not in this workspace." };
  refresh();
  return { ok: true };
}

/**
 * Stop keeping this value.
 *
 * 🔴 A SYSTEM FIELD CANNOT GO. The app writes meetingLink itself and a sequence
 * somewhere is already saying {{meetingLink}}; a workspace is not expected to know
 * that, so the answer is a refusal rather than a message that quietly stops filling in.
 */
export async function deleteContactField(id: string): Promise<ActionResult> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  const field = await prisma.contactField.findFirst({
    where: { id, tenantId: s.tenantId },
    select: { id: true, system: true, label: true },
  });
  if (!field) return { ok: false, error: "That value is not in this workspace." };
  if (field.system) {
    return { ok: false, error: `${field.label} is filled in by the app itself, so it cannot be removed.` };
  }
  // The values go with it, by the cascade. Said plainly in the confirm on screen: this
  // is the one action here that destroys something somebody typed.
  await prisma.contactField.delete({ where: { id } });
  refresh();
  return { ok: true };
}

/** Fill in one person's value by hand. Blank clears it. */
export async function setContactFieldValue(
  contactId: string,
  key: string,
  value: string,
): Promise<ActionResult> {
  const s = await ownerScope();
  if (!s.ok) return s.result;
  // The contact is checked against the workspace, not just the field: an id from a
  // browser is a request to touch a row, never permission to.
  const c = await prisma.contact.findFirst({
    where: { id: contactId, tenantId: s.tenantId },
    select: { id: true },
  });
  if (!c) return { ok: false, error: "That contact is not in this workspace." };
  await setContactValue(s.tenantId, contactId, key, value.slice(0, 2000));
  refresh();
  return { ok: true };
}

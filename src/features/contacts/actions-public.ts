"use server";

import { revalidatePath } from "next/cache";
import { suppressByToken } from "@/lib/contacts/dnd";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The PUBLIC half of contacts: one action, callable with no session, reached only by
 * holding an unguessable token.
 *
 * Kept in its own file rather than beside the admin actions so the authorisation story
 * is obvious from the filename. Everything in features/contacts/actions.ts requires a
 * logged-in scope; this one deliberately does not, because somebody who wants out must
 * not have to sign in first.
 */
export async function unsubscribeByToken(token: string): Promise<ActionResult> {
  const done = await suppressByToken(token, "LINK");
  if (!done) return { ok: false, error: "That unsubscribe link is not valid any more." };
  revalidatePath(`/u/${token}`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/**
 * The way out of the trial sequence. No login, by necessity: somebody who wants out
 * must not have to get in first.
 *
 * 🔴 A POST and never a GET. Corporate mail scanners fetch every link in an email
 * before the person ever sees it, so acting on arrival would unsubscribe people who
 * never clicked anything. The page renders a button; this is what the button calls.
 *
 * Separate from the contact opt-out in features/contacts: a trial signup is OUR
 * customer, and an owner escaping our emails has not opted their own respondents out
 * of their own funnel.
 */
export async function stopLifecycleByToken(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  // updateMany rather than update: an unknown token must do nothing quietly rather
  // than throw, which would turn this page into somewhere to test guesses.
  await prisma.lifecycleProfile.updateMany({
    where: { optOutToken: token },
    data: { status: "UNSUBSCRIBED", stopReason: "Asked to stop." },
  });
  revalidatePath(`/ls/${token}`);
}

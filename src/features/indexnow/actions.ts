"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { submitIndexNow, type SubmitSummary } from "@/lib/indexnow/submit";

/** Super admin, IndexNow: send every public page now, changed or not. */
export async function submitAllPagesNow(): Promise<{ ok: true; summary: SubmitSummary[] }> {
  await requireSuperAdmin();
  const summary = await submitIndexNow({ force: true });
  revalidatePath("/admin/indexnow");
  return { ok: true, summary };
}

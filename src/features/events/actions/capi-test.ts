"use server";

import { requireSuperAdmin } from "@/lib/auth/guards";
import { testCapi } from "@/lib/meta/send";

/** Super-admin diagnostic: fire a server-side AssessmentCompleted to Meta CAPI
 *  and return Meta's real response. */
export async function testMetaCapi() {
  await requireSuperAdmin();
  return testCapi();
}

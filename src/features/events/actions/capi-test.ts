"use server";

import { requireSuperAdmin } from "@/lib/auth/guards";
import { testCapi } from "@/lib/meta/send";

/** Super-admin diagnostic: fire a server-side CAPI event (any name, default
 *  AssessmentCompleted) to Meta and return Meta's real response. */
export async function testMetaCapi(testEventCode?: string, eventName?: string) {
  await requireSuperAdmin();
  return testCapi(testEventCode, eventName);
}

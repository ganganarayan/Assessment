import "server-only";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/nurture/send";
import { PLATFORM_SUPPORT_EMAIL } from "@/lib/platform-support";

/**
 * Tell the owner that nobody's template fits this workspace.
 *
 * WHY THIS IS A MESSAGE AND NOT A REPORT. The industry question offers the template
 * library's own categories and one more, "Something else". Choosing it is the only
 * moment anybody tells us that the library has a hole in it, and the useful window for
 * that information is the few days before their setup call, not whenever somebody next
 * thinks to run a query. So it is sent.
 *
 * It is also STORED, on the tenant, which is what makes it findable afterwards: a mail
 * host that times out must not be the only record that a funnel has to be written. The
 * column is written by the step before this is ever called, and this never throws, for
 * the same reason the intake notifies after it has stored - an answer that reached the
 * database has not been lost just because an alert did not arrive.
 */
export async function notifyTemplateGap(tenantId: string): Promise<void> {
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true, sells: true, pricePoint: true, industryOther: true },
    });
    if (!t) return;

    const body = [
      `Workspace: ${t.name} (${t.slug})`,
      `Industry they typed: ${t.industryOther || "-"}`,
      `What they sell: ${t.sells || "-"}`,
      `Price: ${t.pricePoint || "-"}`,
      "",
      "Nothing in the library matched, so the import step is offering them the closest",
      "few instead and saying we will build theirs on the call.",
    ].join("\n");

    const err = await sendEmail(
      null,
      PLATFORM_SUPPORT_EMAIL,
      `No template for: ${t.industryOther || t.name}`,
      `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
    ).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

    if (err) console.error("[onboarding] template-gap alert failed:", err);
  } catch (e) {
    // Never the tenant's problem. They answered a question; the consequence of this
    // failing is that the owner reads it off the admin list instead of an inbox.
    console.error("[onboarding] template-gap alert threw:", e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

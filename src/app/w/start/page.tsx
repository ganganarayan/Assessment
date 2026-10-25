import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/guards";
import { getOnboardingView, getStarterTemplates } from "@/features/onboarding/data";
import { getWhatsAppConnectInfo } from "@/features/whatsapp/actions";
import { OnboardingDialog } from "@/features/onboarding/components/onboarding-dialog";

/**
 * The guided setup as its own address.
 *
 * The dashboard already opens it, so this exists for the links that come from OUTSIDE
 * the app: the "set it up myself" button on the application's result page, the welcome
 * email, a line in a WhatsApp reply. Somebody who arrives here is being sent to the
 * sequence specifically, so it is open on arrival and the page behind it is bare on
 * purpose - there is nothing to read here, only the next question.
 *
 * Finishing, or closing, goes to the dashboard: the sequence ends where the work starts.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceStartPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { user, tenantId } = await requireWorkspace();
  const view = await getOnboardingView(tenantId, user.id);
  if (!view) redirect("/w/dashboard");

  /**
   * ?step= opens the sequence AT one question, which is what every item in the trial
   * ribbon's "before we can meet" list links to.
   *
   * 🟡 IT ALSO SUSPENDS THE "NOTHING LEFT TO ASK" REDIRECT. A booking prerequisite can
   * be outstanding on a sequence that calls itself complete, because skipping a step
   * finishes it: somebody who skipped the Conversions API token has no next question and
   * still cannot be met. Redirecting them to the dashboard would make the ribbon's own
   * link a dead end, which is the one thing that list cannot be.
   */
  const asked = (await searchParams).step?.trim();
  const target = asked && view.steps.some((s) => s.key === asked) ? asked : null;
  if (!target && view.complete) redirect("/w/dashboard");

  const starters = await getStarterTemplates(tenantId);
  const current = target ?? view.currentKey;
  const whatsapp = current === "whatsappConnect" ? await getWhatsAppConnectInfo() : null;
  return (
    <OnboardingDialog
      initial={view}
      templates={starters}
      whatsapp={whatsapp}
      startAt={target}
      alwaysOpen
    />
  );
}

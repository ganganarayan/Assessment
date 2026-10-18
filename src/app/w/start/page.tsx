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

export default async function WorkspaceStartPage() {
  const { user, tenantId } = await requireWorkspace();
  const view = await getOnboardingView(tenantId, user.id);
  // Not a workspace being onboarded (the platform, or an internal tenant), or there is
  // nothing left to ask. Either way the dashboard is the honest destination.
  if (!view || view.complete) redirect("/w/dashboard");

  const starters = await getStarterTemplates(tenantId);
  const whatsapp = view.currentKey === "whatsappConnect" ? await getWhatsAppConnectInfo() : null;
  return <OnboardingDialog initial={view} templates={starters} whatsapp={whatsapp} alwaysOpen />;
}

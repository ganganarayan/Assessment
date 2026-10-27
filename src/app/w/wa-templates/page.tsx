import { waTemplatePageProps } from "@/features/wa-templates/page-data";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { WaTemplateManager } from "@/features/wa-templates/components/wa-template-manager";

export const dynamic = "force-dynamic";

/**
 * WhatsApp templates: the wording Meta has to approve before a business may message
 * somebody first.
 */
export default async function WorkspaceWaTemplatesPage() {
  // Held back until the owner releases it: a hidden link is presentation, not a permission.
  await requireReleasedFeature("waTemplates");
  const props = await waTemplatePageProps();
  return <WaTemplateManager {...props} />;
}

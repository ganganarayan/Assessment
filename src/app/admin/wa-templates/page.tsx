import { waTemplatePageProps } from "@/features/wa-templates/page-data";
import { WaTemplateManager } from "@/features/wa-templates/components/wa-template-manager";

export const dynamic = "force-dynamic";

/** WhatsApp templates for the acting workspace: the platform's own, or the entered tenant's. */
export default async function AdminWaTemplatesPage() {
  const props = await waTemplatePageProps();
  return <WaTemplateManager {...props} />;
}

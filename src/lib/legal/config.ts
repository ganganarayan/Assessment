import "server-only";
import { prisma } from "@/lib/db/prisma";
import { MARKETING } from "@/lib/marketing/content";

/**
 * Public legal/company details for the policy pages. Read from the singleton
 * AppSetting row (no auth — these values are meant to be public). Blank fields
 * fall back to a visible placeholder so an unconfigured page reads as "to be set"
 * rather than silently omitting a required clause.
 */
export interface LegalConfig {
  brand: string;
  entityName: string;
  address: string;
  contactEmail: string;
  governingLocation: string;
}

const PLACEHOLDER = {
  entityName: "[Legal entity name — set in Settings]",
  address: "[Registered address — set in Settings]",
  contactEmail: "[Contact email — set in Settings]",
  governingLocation: "[City, State — set in Settings]",
} as const;

export async function getLegalConfig(): Promise<LegalConfig> {
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      legalEntityName: true,
      legalAddress: true,
      legalContactEmail: true,
      legalGoverningLocation: true,
    },
  });
  return {
    brand: MARKETING.name,
    entityName: s?.legalEntityName?.trim() || PLACEHOLDER.entityName,
    address: s?.legalAddress?.trim() || PLACEHOLDER.address,
    contactEmail: s?.legalContactEmail?.trim() || PLACEHOLDER.contactEmail,
    governingLocation: s?.legalGoverningLocation?.trim() || PLACEHOLDER.governingLocation,
  };
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { MARKETING } from "@/lib/marketing/content";

/**
 * Public legal/company details for the policy pages. Read from the singleton
 * AppSetting row (no auth - these values are meant to be public). Blank fields
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

/**
 * The same row, read for STRUCTURED DATA instead of for a policy page - which is why
 * every field is nullable and nothing is substituted.
 *
 * The placeholders below are a feature on a page a human reads ("set this in Settings")
 * and a defect in JSON-LD, where "[Legal entity name - set in Settings]" would be
 * published to Google and Bing as this company's registered name. Unset therefore has to
 * mean ABSENT here: the schema builder omits the property rather than emitting a
 * placeholder, so an incomplete graph is incomplete and never wrong.
 */
export interface EntityFacts {
  legalName: string | null;
  address: string | null;
  contactEmail: string | null;
  /** Public tax identifier (GSTIN). */
  taxId: string | null;
  /** ISO year-month, e.g. "2024-02" - schema.org accepts a partial foundingDate. */
  foundedOn: string | null;
}

const PLACEHOLDER = {
  entityName: "[Legal entity name - set in Settings]",
  address: "[Registered address - set in Settings]",
  contactEmail: "[Contact email - set in Settings]",
  governingLocation: "[City, State - set in Settings]",
} as const;

const SELECT = {
  legalEntityName: true,
  legalAddress: true,
  legalContactEmail: true,
  legalGoverningLocation: true,
  legalGstin: true,
  legalFoundedOn: true,
} as const;

/** Trimmed, or null - never an empty string, so callers can treat null as "unset". */
function clean(v: string | null | undefined): string | null {
  return v?.trim() || null;
}

export async function getLegalConfig(): Promise<LegalConfig> {
  const s = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: SELECT });
  return {
    brand: MARKETING.name,
    entityName: clean(s?.legalEntityName) ?? PLACEHOLDER.entityName,
    address: clean(s?.legalAddress) ?? PLACEHOLDER.address,
    contactEmail: clean(s?.legalContactEmail) ?? PLACEHOLDER.contactEmail,
    governingLocation: clean(s?.legalGoverningLocation) ?? PLACEHOLDER.governingLocation,
  };
}

/** The entity, as facts. Null means "not configured" - the caller omits the property. */
export async function getEntityFacts(): Promise<EntityFacts> {
  const s = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: SELECT });
  return {
    legalName: clean(s?.legalEntityName),
    address: clean(s?.legalAddress),
    contactEmail: clean(s?.legalContactEmail),
    taxId: clean(s?.legalGstin),
    foundedOn: clean(s?.legalFoundedOn),
  };
}

import { legalLinksFor } from "@/lib/tenant/legal-links";

/**
 * Privacy and terms links under a respondent-facing page, for the page's OWNER tenant.
 * Renders nothing when the tenant has set neither. Server component.
 */
export async function TenantLegalFooter({ tenantId }: { tenantId: string | null | undefined }) {
  const { privacyUrl, termsUrl } = await legalLinksFor(tenantId);
  if (!privacyUrl && !termsUrl) return null;
  return (
    <footer className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-4 px-4 py-6 text-xs text-[var(--muted-foreground)]">
      {privacyUrl ? (
        <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          Privacy policy
        </a>
      ) : null}
      {termsUrl ? (
        <a href={termsUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          Terms
        </a>
      ) : null}
    </footer>
  );
}

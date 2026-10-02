import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MARKETING } from "@/lib/marketing/content";
import { currentOrigin } from "@/lib/seo/site";
import { THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";
import { getCurrentTenant } from "@/lib/tenant/context";
import "./globals.css";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** Only emit CSS for values that are strictly hex — never inject stored text as-is. */
function tenantThemeCss(primary?: string | null, secondary?: string | null): string | null {
  const p = primary && HEX.test(primary) ? primary : null;
  const s = secondary && HEX.test(secondary) ? secondary : null;
  if (!p && !s) return null;
  const vars = `${p ? `--primary:${p};` : ""}${s ? `--secondary:${s};` : ""}`;
  // Apply in both light and dark so the brand accent wins in either mode.
  return `:root{${vars}}.dark{${p ? `--primary:${p};` : ""}}`;
}

/**
 * The DEFAULTS every route inherits, and they have to be host-aware, because this one
 * layout wraps the marketing site, the admin app and every tenant's funnel.
 *
 * It used to hard-code title "Assessment" / "Multi-tenant assessment platform
 * foundation." — scaffolding copy that then became the real, indexable title of every
 * page that does not set its own, tenant funnels included.
 *
 * - Platform host: the marketing title and description, with a template so a page can
 *   pass a bare name ("Privacy Policy") and get the brand appended once.
 * - Tenant host: the TENANT's name, and NO description. An absent description lets the
 *   search engine write one from the page; inheriting ours would describe someone
 *   else's scorecard as lead-qualification software.
 *
 * metadataBase is the request's own origin so that relative URLs in child metadata
 * resolve against the host being served, not against a guess.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [origin, tenant] = await Promise.all([currentOrigin(), getCurrentTenant()]);
  const metadataBase = new URL(origin);

  if (tenant) {
    return { metadataBase, title: { default: tenant.name, template: `%s · ${tenant.name}` } };
  }

  return {
    metadataBase,
    title: { default: MARKETING.title, template: `%s · ${MARKETING.name}` },
    description: MARKETING.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [cookieStore, tenant] = await Promise.all([cookies(), getCurrentTenant()]);
  const theme = cookieStore.get(THEME_COOKIE)?.value;
  // Explicit light/dark can be set server-side; "system" is resolved by the
  // pre-paint init script. suppressHydrationWarning: the script may add `dark`.
  const htmlClass = theme === "dark" ? "dark" : undefined;

  // On a resolved tenant (subdomain / custom domain), apply their brand colors.
  // Null on the platform root, so the marketing home keeps the default palette.
  const themeCss = tenantThemeCss(tenant?.theme?.primaryColor, tenant?.theme?.secondaryColor);

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
        {children}
      </body>
    </html>
  );
}
